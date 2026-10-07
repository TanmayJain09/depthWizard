"""Stage 4 helper: sparse SRTM reference heights for georeferenced uploads.

Tiles come from the public AWS 'skadi' SRTM mirror (no API key), are cached in
backend/srtm_cache/, and are sampled bilinearly at random ground/water pixels.
"""
import gzip
import math
from functools import lru_cache
from pathlib import Path

import httpx
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import transform as warp_transform
from scipy.ndimage import map_coordinates

from .segmentation import GROUND, WATER

CACHE_DIR = Path(__file__).resolve().parents[1] / "srtm_cache"
URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/{ns}{la:02d}/{name}.hgt.gz"
VOID = -32768
MIN_POINTS = 30


def _tile_name(lat0: int, lon0: int):
    ns, ew = ("N" if lat0 >= 0 else "S"), ("E" if lon0 >= 0 else "W")
    return ns, abs(lat0), f"{ns}{abs(lat0):02d}{ew}{abs(lon0):03d}"


@lru_cache(maxsize=8)
def _load_tile(lat0: int, lon0: int) -> np.ndarray:
    """1x1 degree tile, int16 big-endian, row 0 = north edge, col 0 = west edge."""
    ns, la, name = _tile_name(lat0, lon0)
    path = CACHE_DIR / f"{name}.hgt"
    if not path.exists():
        CACHE_DIR.mkdir(exist_ok=True)
        r = httpx.get(URL.format(ns=ns, la=la, name=name), timeout=60, follow_redirects=True)
        r.raise_for_status()
        path.write_bytes(gzip.decompress(r.content))
    raw = np.fromfile(path, dtype=">i2")
    n = int(round(math.sqrt(raw.size)))
    tile = raw.reshape(n, n).astype(np.float32)
    tile[tile == VOID] = np.nan
    return tile


def sample_srtm(lons, lats) -> np.ndarray:
    """Bilinear SRTM height (metres above sea level) at each lon/lat. NaN where void."""
    lons, lats = np.asarray(lons, float), np.asarray(lats, float)
    out = np.full(lons.shape, np.nan, np.float32)
    lat0, lon0 = np.floor(lats).astype(int), np.floor(lons).astype(int)
    for la, lo in set(zip(lat0.tolist(), lon0.tolist())):
        m = (lat0 == la) & (lon0 == lo)
        tile = _load_tile(la, lo)
        n = tile.shape[0] - 1
        rows = (la + 1 - lats[m]) * n
        cols = (lons[m] - lo) * n
        out[m] = map_coordinates(tile, [rows, cols], order=1, mode="nearest")
    return out


def _pick_and_sample(ds, labels: np.ndarray, n_ref: int, seed: int) -> np.ndarray:
    # SRTM is ~30 m, so only trust it on terrain: ground and water pixels.
    idx = np.flatnonzero(np.isin(labels, (GROUND, WATER)).ravel())
    n = min(n_ref, len(idx))
    if n < MIN_POINTS:
        raise ValueError("Too few ground/water pixels to sample SRTM.")
    pick = np.random.default_rng(seed).choice(idx, n, replace=False)
    rows, cols = np.divmod(pick, labels.shape[1])
    xs, ys = ds.xy(rows, cols)
    lons, lats = warp_transform(ds.crs, "EPSG:4326", list(xs), list(ys))
    ref = np.full(labels.shape, np.nan, np.float32)
    ref[rows, cols] = sample_srtm(lons, lats)
    return ref


def srtm_reference(image_src, labels: np.ndarray, n_ref: int = 256, seed: int = 0) -> np.ndarray:
    """(H, W) float32: SRTM metres at sampled pixels, NaN elsewhere (same format as load_reference)."""
    if isinstance(image_src, (bytes, bytearray)):
        with MemoryFile(bytes(image_src)) as mf, mf.open() as ds:
            return _pick_and_sample(ds, labels, n_ref, seed)
    with rasterio.open(image_src) as ds:
        return _pick_and_sample(ds, labels, n_ref, seed)