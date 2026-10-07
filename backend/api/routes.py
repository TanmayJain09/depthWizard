from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from pipeline.run import run_pipeline
from . import jobs
from .schemas import JobCreated, JobStatus, Metadata

router = APIRouter(prefix="/api/v1")
FILES = {"heightmap.png": "image/png", "confidence.png": "image/png", "texture.jpg": "image/jpeg"}


def _work(jid, image_b, labels_b, ref_b, dfc, robust, pixel_size):
    try:
        jobs.set_job(jid, status="processing")
        out = run_pipeline(image_b, labels_b, ref_b, dfc_labels=dfc, robust=robust)
        jobs.write_outputs(jid, out, pixel_size)
        jobs.set_job(jid, status="done")
    except Exception as e:  # surface any pipeline error to the client
        jobs.set_job(jid, status="failed", error=str(e))


@router.post("/process", response_model=JobCreated, status_code=202)
async def process(
    bg: BackgroundTasks,
    image: UploadFile = File(...),
    labels: UploadFile = File(...),                       # segmentation is not automated yet
    reference: Optional[UploadFile] = File(None),         # sparse/DSM heights -> georeferenced mode
    dfc_labels: bool = Form(False),
    robust: bool = Form(False),
    pixel_size_m: Optional[float] = Form(None),
):
    image_b, labels_b = await image.read(), await labels.read()
    ref_b = await reference.read() if reference else None
    jid = jobs.create_job()
    bg.add_task(_work, jid, image_b, labels_b, ref_b, dfc_labels, robust, pixel_size_m)
    return JobCreated(job_id=jid, status_url=f"/api/v1/jobs/{jid}")


@router.get("/jobs/{jid}", response_model=JobStatus)
def status(jid: str):
    j = jobs.get_job(jid)
    if not j:
        raise HTTPException(404, "Unknown job")
    return JobStatus(job_id=jid, status=j["status"], error=j["error"],
                     metadata_url=f"/api/v1/jobs/{jid}/metadata" if j["status"] == "done" else None)


def _require_done(jid):
    j = jobs.get_job(jid)
    if not j:
        raise HTTPException(404, "Unknown job")
    if j["status"] != "done":
        raise HTTPException(409, f"Job is {j['status']}")


@router.get("/jobs/{jid}/metadata", response_model=Metadata)
def metadata(jid: str):
    _require_done(jid)
    import json
    return JSONResponse(json.loads((jobs.job_dir(jid) / "metadata.json").read_text()))


@router.get("/jobs/{jid}/{name}")
def file(jid: str, name: str):
    if name not in FILES:
        raise HTTPException(404, "Unknown file")
    _require_done(jid)
    return FileResponse(jobs.job_dir(jid) / name, media_type=FILES[name])
