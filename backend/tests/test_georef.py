import io
import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from PIL import Image
from pipeline.input_handler import inspect_georef


def _tiff(georef):
    kw = dict(driver="GTiff", height=64, width=64, count=3, dtype="uint8")
    if georef:
        kw.update(crs="EPSG:32643", transform=from_origin(400000, 2000000, 10, 10))
    with MemoryFile() as mf:
        with mf.open(**kw) as ds:
            ds.write(np.random.randint(0, 255, (3, 64, 64), dtype=np.uint8))
        return mf.read()


def test_georeferenced_tiff():
    g = inspect_georef(_tiff(True))
    assert g["is_georeferenced"] and g["pixel_size_m"] == 10 and len(g["bounds_wgs84"]) == 4


def test_plain_tiff_and_png():
    assert not inspect_georef(_tiff(False))["is_georeferenced"]
    b = io.BytesIO(); Image.fromarray(np.zeros((8, 8, 3), np.uint8)).save(b, "PNG")
    assert not inspect_georef(b.getvalue())["is_georeferenced"]