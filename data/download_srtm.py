"""Optional: pre-download an SRTM tile into backend/srtm_cache/.

Usage (from the repo root):  python data/download_srtm.py 18.5 73.8
The API downloads tiles automatically on first use, so this is only for warming the cache.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from pipeline.srtm import _load_tile  # noqa: E402

if __name__ == "__main__":
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    tile = _load_tile(math.floor(lat), math.floor(lon))
    print(f"Cached tile for ({lat}, {lon}): {tile.shape}")