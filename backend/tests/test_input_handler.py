import io

import numpy as np
import rasterio
from PIL import Image

from pipeline.input_handler import load_image, load_labels, sparse_reference


def _write_tif(path, arr):
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0],
                       width=arr.shape[1], count=1, dtype=arr.dtype) as dst:
        dst.write(arr, 1)


def test_load_image_from_png_bytes():
    buf = io.BytesIO()
    Image.fromarray(np.zeros((8, 8, 3), np.uint8)).save(buf, format="PNG")
    assert load_image(buf.getvalue())[0].size == (8, 8)


def test_load_labels_remaps_dfc(tmp_path):
    p = tmp_path / "cls.tif"
    _write_tif(p, np.array([[2, 5], [6, 9]], dtype=np.uint8))
    assert load_labels(p).tolist() == [[0, 1], [2, 3]]


def test_sparse_reference():
    agl = np.random.default_rng(0).random((64, 64)).astype(np.float32)
    labels = np.zeros((64, 64), np.uint8)
    ref, held = sparse_reference(agl, labels, n_ref=100)
    assert np.isfinite(ref).sum() == 100
    assert not (held & np.isfinite(ref)).any()