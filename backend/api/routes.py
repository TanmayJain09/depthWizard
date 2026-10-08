import os
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from pipeline.run import run_pipeline
from . import jobs
from .schemas import JobCreated, JobStatus, Metadata

MAX_UPLOAD_MB = float(os.environ.get("MAX_UPLOAD_MB", "200"))
MAX_UPLOAD_BYTES = int(MAX_UPLOAD_MB * 1024 * 1024)

router = APIRouter(prefix="/api/v1")
FILES = {
    "heightmap.png": "image/png",
    "confidence.png": "image/png",
    "texture.jpg": "image/jpeg",
    "calibrated_georeference.tif": "image/tiff"
}


def _work(jid, image_b, labels_b, ref_b, dfc, robust, pixel_size):
    try:
        jobs.set_job(jid, status="processing")
        out = run_pipeline(image_b, labels_b, ref_b, dfc_labels=dfc, robust=robust, jid=jid)
        jobs.set_job(jid, stage="writing")
        jobs.write_outputs(jid, out, pixel_size)
        jobs.set_job(jid, status="done", stage=None)
    except Exception as e:  # surface any pipeline error to the client
        jobs.set_job(jid, status="failed", error=str(e), stage=None)


async def _read_with_limit(upload: Optional[UploadFile]) -> Optional[bytes]:
    if not upload:
        return None
    content = await upload.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File {upload.filename} exceeds {MAX_UPLOAD_MB} MB limit.")
    return content


@router.post("/process", response_model=JobCreated, status_code=202)
async def process(
    bg: BackgroundTasks,
    image: UploadFile = File(...),
    labels: Optional[UploadFile] = File(None),
    reference: Optional[UploadFile] = File(None),
    dfc_labels: bool = Form(False),
    robust: bool = Form(False),
    pixel_size_m: Optional[float] = Form(None),
):
    image_b = await _read_with_limit(image)
    labels_b = await _read_with_limit(labels)
    ref_b = await _read_with_limit(reference)
    
    jid = jobs.create_job()
    bg.add_task(_work, jid, image_b, labels_b, ref_b, dfc_labels, robust, pixel_size_m)
    return JobCreated(job_id=jid, status_url=f"/api/v1/jobs/{jid}")


@router.get("/jobs/{jid}", response_model=JobStatus)
def status(jid: str):
    j = jobs.get_job(jid)
    if not j:
        raise HTTPException(404, "Unknown job")
    return JobStatus(
        job_id=jid, 
        status=j["status"],
        stage=j.get("stage"),
        error=j["error"],
        metadata_url=f"/api/v1/jobs/{jid}/metadata" if j["status"] == "done" else None
    )


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
    path = jobs.job_dir(jid) / name
    if not path.exists():
        raise HTTPException(404, "File not available for this job")
    return FileResponse(path, media_type=FILES[name])
