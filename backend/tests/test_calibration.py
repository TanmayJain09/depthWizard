import numpy as np
import pytest

from pipeline.calibration import calibrate_georeferenced, calibrate_relative
from pipeline.segmentation import GROUND, VEGETATION, BUILDING, WATER

TRUE_A = {GROUND: 1.0, VEGETATION: 8.0, BUILDING: 15.0, WATER: 0.5}
TRUE_B = {GROUND: 0.0, VEGETATION: 1.0, BUILDING: 2.0, WATER: 0.0}


def _scene(n=128, seed=0):
    rng = np.random.default_rng(seed)
    labels = rng.integers(0, 4, size=(n, n)).astype(np.uint8)
    depth = rng.random((n, n)).astype(np.float32)
    height = np.zeros_like(depth)
    for c in TRUE_A:
        m = labels == c
        height[m] = TRUE_A[c] * depth[m] + TRUE_B[c]
    return depth, labels, height


def test_recovers_per_class_params_from_sparse_reference():
    depth, labels, height = _scene()
    ref = np.full(depth.shape, np.nan, dtype=np.float32)
    idx = np.random.default_rng(1).choice(depth.size, 600, replace=False)
    ref.flat[idx] = height.flat[idx]

    res = calibrate_georeferenced(depth, labels, ref)
    for c in TRUE_A:
        a, b = res.params[c]
        assert a == pytest.approx(TRUE_A[c], abs=1e-3)
        assert b == pytest.approx(TRUE_B[c], abs=1e-3)
    assert np.abs(res.dsm - height).max() < 1e-2


def test_no_reference_raises():
    depth, labels, _ = _scene()
    with pytest.raises(ValueError):
        calibrate_georeferenced(depth, labels, np.full(depth.shape, np.nan, dtype=np.float32))


def test_relative_mode_returns_finite_dsm():
    depth, labels, _ = _scene()
    res = calibrate_relative(depth, labels)
    assert res.dsm.shape == depth.shape
    assert np.isfinite(res.dsm).all()