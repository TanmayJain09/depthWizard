"""In-memory job store + output writer. Swap the dict for Redis/DB if you scale out."""
import json
import threading
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs"
_jobs: dict = {}
_lock = threading.Lock()


def create_job() -> str:
    jid = uuid.uuid4().hex[:12]
    with _lock:
        _jobs[jid] = {"status": "queued", "error": None}
    return jid


def get_job(jid):
    with _lock:
        return dict(_jobs[jid]) if jid in _jobs else None


def set_job(jid, **kw):
    with _lock:
        _jobs[jid].update(kw)


def job_dir(jid) -> Path:
    d = OUTPUT_DIR / jid
    d.mkdir(parents=True, exist_ok=True)
    return d


def write_outputs(jid, out: dict, pixel_size_m=None) -> dict:
    """Write heightmap.png (16-bit), confidence.png (8-bit), texture.jpg, metadata.json."""
    d = job_dir(jid)
    res, conf = out["result"], out["conf"]
    dsm = np.nan_to_num(res.dsm, nan=0.0)
    relative = res.method == "relative"

    lo, hi = float(dsm.min()), float(dsm.max())
    span = hi - lo if hi > lo else 1.0
    h16 = np.round((dsm - lo) / span * 65535).astype(np.uint16)
    Image.fromarray(h16).save(d / "heightmap.png")                       # I;16 PNG
    Image.fromarray((conf["confidence"] * 255).round().astype(np.uint8)).save(d / "confidence.png")
    out["image"].convert("RGB").save(d / "texture.jpg", quality=92)

    H, W = dsm.shape
    base = f"/api/v1/jobs/{jid}"
    meta = {
        "job_id": jid,
        "mode": res.method,
        "units": "normalized" if relative else "metres",
        # relative mode: heights are proportions only, so expose a 0-1 range
        "height_min": 0.0 if relative else lo,
        "height_max": 1.0 if relative else hi,
        "heightmap_encoding": "16-bit grayscale PNG; value = height_min + (px/65535)*(height_max-height_min)",
        "width": W, "height": H,
        "pixel_size_m": pixel_size_m,
        "mean_confidence": float(conf["confidence"].mean()),
        "classes": out["summary"],
        "files": {"heightmap": f"{base}/heightmap.png",
                  "confidence": f"{base}/confidence.png",
                  "texture": f"{base}/texture.jpg"},
    }
    (d / "metadata.json").write_text(json.dumps(meta, indent=2))
    return meta
