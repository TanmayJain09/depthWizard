import json
import math
import os
import shutil
import threading
import time
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

from .schemas import Metadata


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_TTL_HOURS = float(os.environ.get("OUTPUT_TTL_HOURS", "24"))

_jobs: dict = {}
_lock = threading.Lock()


def _cleanup_loop():
    while True:
        try:
            now = time.time()
            ttl_seconds = OUTPUT_TTL_HOURS * 3600
            if ttl_seconds > 0:
                with _lock:
                    for d in OUTPUT_DIR.iterdir():
                        if not d.is_dir():
                            continue
                        stat = d.stat()
                        # Use max of mtime and ctime
                        age = now - max(stat.st_mtime, stat.st_ctime)
                        if age > ttl_seconds:
                            shutil.rmtree(d, ignore_errors=True)
                            if d.name in _jobs:
                                del _jobs[d.name]
        except Exception:
            pass
        time.sleep(3600)  # Check every hour

# Start cleanup thread
t = threading.Thread(target=_cleanup_loop, daemon=True)
t.start()


def _save_job(jid: str):
    job = _jobs[jid]
    job_file = OUTPUT_DIR / jid / "job.json"
    job_file.parent.mkdir(parents=True, exist_ok=True)
    with open(job_file, "w") as f:
        json.dump(job, f)


def _load_jobs():
    with _lock:
        if OUTPUT_DIR.exists():
            for d in OUTPUT_DIR.iterdir():
                if d.is_dir():
                    job_file = d / "job.json"
                    if job_file.exists():
                        try:
                            with open(job_file) as f:
                                _jobs[d.name] = json.load(f)
                        except Exception:
                            pass

# Load existing jobs on startup
_load_jobs()


def create_job() -> str:
    jid = uuid.uuid4().hex[:12]
    with _lock:
        _jobs[jid] = {
            "status": "queued",
            "stage": "loading",
            "error": None,
        }
        _save_job(jid)
    return jid


def get_job(jid):
    with _lock:
        return dict(_jobs[jid]) if jid in _jobs else None


def set_job(jid, **kw):
    with _lock:
        _jobs[jid].update(kw)
        _save_job(jid)


def job_dir(jid) -> Path:
    d = OUTPUT_DIR / jid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _clean_nan(obj):
    """Recursively convert float NaN/Inf to None to make it NaN-safe."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj


def write_outputs(jid, out: dict, pixel_size_m=None) -> dict:
    d = job_dir(jid)
    res = out["result"]
    conf = out["conf"]
    geo = out["geo"]

    # ------------------------------------------------------------------
    # Heightmap
    # ------------------------------------------------------------------
    # User requested: compute min/max with nanmin/nanmax BEFORE any NaN replacement
    valid_dsm = res.dsm[~np.isnan(res.dsm)]
    if len(valid_dsm) > 0:
        lo = float(np.nanmin(res.dsm))
        hi = float(np.nanmax(res.dsm))
    else:
        lo, hi = 0.0, 1.0

    if lo == hi:
        hi = lo + 1.0

    dsm = np.nan_to_num(res.dsm, nan=0.0)
    H, W = dsm.shape
    relative = res.method == "relative"

    span = hi - lo
    h16 = np.round(
        (dsm - lo) / span * 65535
    ).astype(np.uint16)

    Image.fromarray(h16).save(d / "heightmap.png")

    # ------------------------------------------------------------------
    # Confidence map
    # ------------------------------------------------------------------
    confidence = (conf["confidence"] * 255).round().astype(np.uint8)
    Image.fromarray(confidence).save(d / "confidence.png")

    # ------------------------------------------------------------------
    # Texture
    # ------------------------------------------------------------------
    out["image"].convert("RGB").save(d / "texture.jpg", quality=92)

    # ------------------------------------------------------------------
    # Calibrated Georeference TIFF
    # ------------------------------------------------------------------
    if geo.get("is_georeferenced") and geo.get("transform") and geo.get("crs"):
        try:
            import rasterio
            from rasterio.transform import Affine
            transform = Affine(*geo["transform"])
            tif_path = d / "calibrated_georeference.tif"
            with rasterio.open(
                tif_path,
                'w',
                driver='GTiff',
                height=H,
                width=W,
                count=1,
                dtype=dsm.dtype,
                crs=geo["crs"],
                transform=transform,
                nodata=np.nan
            ) as dst:
                dst.write(dsm, 1)
        except Exception:
            pass

    base = f"/api/v1/jobs/{jid}"

    files = {
        "heightmap": f"{base}/heightmap.png",
        "confidence": f"{base}/confidence.png",
        "texture": f"{base}/texture.jpg",
    }
    
    # Check for calibrated_georeference.tif
    if geo.get("is_georeferenced") and (d / "calibrated_georeference.tif").exists():
        files["calibrated_georeference"] = f"{base}/calibrated_georeference.tif"

    meta = {
        "job_id": jid,
        "mode": res.method,
        "units": "normalized" if relative else "metres",
        "height_min": 0.0 if relative else lo,
        "height_max": 1.0 if relative else hi,
        "heightmap_encoding": (
            "16-bit grayscale PNG; value = height_min + (px/65535)*(height_max-height_min)"
        ),
        "width": W,
        "height": H,
        "pixel_size_m": pixel_size_m or geo.get("pixel_size_m"),
        "is_georeferenced": geo["is_georeferenced"],
        "crs": geo.get("crs"),
        "bounds_wgs84": geo.get("bounds_wgs84"),
        "srtm_error": geo.get("srtm_error"),
        
        # New optional fields
        "transform": geo.get("transform"),
        "height_datum": geo.get("height_datum"),
        "segmentation_source": geo.get("segmentation_source"),
        "segmentation_warning": geo.get("segmentation_warning"),
        "exif_transposed": geo.get("exif_transposed"),
        "approx_height_range_m": geo.get("approx_height_range_m"),

        "mean_confidence": float(conf["confidence"].mean()),
        "classes": out["summary"],
        "files": files,
    }

    # Clean NaNs and validate against Pydantic schema
    clean_meta = _clean_nan(meta)
    valid_meta_model = Metadata(**clean_meta)
    
    (d / "metadata.json").write_text(valid_meta_model.model_dump_json(exclude_none=True, indent=2))

    return clean_meta
