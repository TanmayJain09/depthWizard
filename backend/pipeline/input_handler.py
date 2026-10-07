"""Load uploads (paths, raw bytes, or file-like objects) into pipeline arrays.

Returns the formats the rest of the pipeline expects:
  image     PIL RGB image
  labels    uint8 (H, W), unified class IDs (see segmentation.py)
  reference float32 (H, W), heights in metres, NaN where unknown
"""
import io
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.warp import transform_bounds
from .segmentation import IGNORE, remap_dfc_labels

MAX_PIXELS = 4096 * 4096
_TIFF_MAGIC = (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+")

def inspect_georef(source) -> dict:
    """Stage 1: detect georeferencing. Only TIFFs can carry it."""
    info = {"is_georeferenced": False, "crs": None,
            "pixel_size_m": None, "bounds_wgs84": None}
    src = _as_path_or_bytes(source)
    if not _is_tiff(src):
        return info
    def _inspect(ds):
        if ds.crs is None or ds.transform.is_identity:
            return info
        info["is_georeferenced"] = True
        info["crs"] = ds.crs.to_string()
        left, bottom, right, top = ds.bounds
        if ds.crs.is_geographic:                 # degrees -> metres
            import math
            lat = (top + bottom) / 2
            info["pixel_size_m"] = abs(ds.res[1]) * 111_320
        else:
            info["pixel_size_m"] = abs(ds.res[0]) * ds.crs.linear_units_factor[1]
        info["bounds_wgs84"] = list(transform_bounds(ds.crs, "EPSG:4326", *ds.bounds))
        return info
    if isinstance(src, bytes):
        with MemoryFile(src) as mf, mf.open() as ds:
            return _inspect(ds)
    with rasterio.open(src) as ds:
        return _inspect(ds)

def _as_path_or_bytes(source):
    if hasattr(source, "read"):          # e.g. FastAPI UploadFile.file
        return source.read()
    if isinstance(source, (bytes, bytearray)):
        return bytes(source)
    return Path(source)


def _is_tiff(src) -> bool:
    if isinstance(src, bytes):
        return src[:4] in _TIFF_MAGIC
    return src.suffix.lower() in (".tif", ".tiff")


def _read_raster(src, bands=None) -> np.ndarray:
    """bands=None -> (B, H, W); bands=int -> (H, W)."""
    if isinstance(src, bytes):
        with MemoryFile(src) as mf, mf.open() as ds:
            return ds.read(bands)
    with rasterio.open(src) as ds:
        return ds.read(bands)


def _check_size(h: int, w: int):
    if h * w > MAX_PIXELS:
        raise ValueError(f"Image too large ({w}x{h}); limit is {MAX_PIXELS} pixels.")


def load_image(source) -> Image.Image:
    """RGB image from PNG/JPG/TIFF. 16-bit TIFFs get a 2-98 percentile stretch."""
    src = _as_path_or_bytes(source)
    if _is_tiff(src):
        arr = _read_raster(src).astype(np.float32)          # (B, H, W)
        arr = arr[:3] if arr.shape[0] >= 3 else np.repeat(arr[:1], 3, axis=0)
        arr = arr.transpose(1, 2, 0)
        if arr.max() > 255:
            lo, hi = np.percentile(arr, (2, 98))
            arr = np.clip((arr - lo) / (hi - lo + 1e-6), 0, 1) * 255
        img = Image.fromarray(arr.astype(np.uint8))
    else:
        img = Image.open(io.BytesIO(src) if isinstance(src, bytes) else src).convert("RGB")
    _check_size(img.height, img.width)
    return img


def load_labels(source, dfc: bool = True) -> np.ndarray:
    """Label raster -> unified class IDs. dfc=True expects raw DFC2019 CLS codes;
    dfc=False expects IDs already in {0,1,2,3} (anything else becomes ignore)."""
    arr = _read_raster(_as_path_or_bytes(source), 1)
    if dfc:
        return remap_dfc_labels(arr)
    out = arr.astype(np.uint8)
    out[~np.isin(out, (0, 1, 2, 3))] = IGNORE
    return out


def load_reference(source) -> np.ndarray:
    """Height raster (e.g. DFC2019 AGL) -> float32 with NaN where not finite."""
    arr = _read_raster(_as_path_or_bytes(source), 1).astype(np.float32)
    arr[~np.isfinite(arr)] = np.nan
    return arr


def sparse_reference(agl: np.ndarray, labels: np.ndarray, n_ref: int = 256, seed: int = 0):
    """Simulate sparse ground-truth points, as in notebook 02.

    Returns (reference, held_out): reference is NaN except at n_ref random valid
    pixels; held_out is the boolean mask of valid pixels NOT used for fitting.
    """
    valid = np.isfinite(agl) & (labels != IGNORE)
    idx = np.flatnonzero(valid.ravel())
    if len(idx) < n_ref:
        raise ValueError(f"Only {len(idx)} valid pixels, need {n_ref} reference points.")
    pick = np.random.default_rng(seed).choice(idx, n_ref, replace=False)
    ref = np.full(agl.shape, np.nan, dtype=np.float32)
    ref.flat[pick] = agl.flat[pick]
    return ref, valid & np.isnan(ref)


def check_shapes(**arrays):
    """Raise if the given (H, W) arrays disagree in size."""
    shapes = {k: v.shape[:2] for k, v in arrays.items() if v is not None}
    if len(set(shapes.values())) > 1:
        raise ValueError(f"Shape mismatch: {shapes}")