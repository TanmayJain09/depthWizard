import numpy as np

from pipeline.calibration import calibrate_georeferenced
from pipeline.confidence import build_confidence, class_summary, interval_coverage
from pipeline.segmentation import GROUND, BUILDING


def _scene(n=64, noise=1.0, seed=0):
    rng = np.random.default_rng(seed)
    labels = (rng.integers(0, 2, (n, n)) * BUILDING).astype(np.uint8)   # ground or building
    depth = rng.random((n, n)).astype(np.float32)
    height = np.where(labels == BUILDING, 15 * depth + 2, 1 * depth)
    height = (height + rng.normal(0, noise, height.shape)).astype(np.float32)
    ref = np.full(depth.shape, np.nan, dtype=np.float32)
    idx = rng.choice(depth.size, 400, replace=False)
    ref.flat[idx] = height.flat[idx]
    return depth, labels, height, ref


def test_confidence_outputs():
    depth, labels, height, ref = _scene()
    res = calibrate_georeferenced(depth, labels, ref)
    out = build_confidence(res, labels)
    assert out["sigma"].shape == depth.shape
    assert np.all((out["confidence"] >= 0) & (out["confidence"] <= 1))
    assert np.all(out["lower"] < out["upper"])
    assert np.allclose(out["sigma"][labels == BUILDING], res.residual_std[BUILDING])
    assert set(class_summary(res)) == {"ground", "building"}


def test_interval_coverage_near_nominal():
    depth, labels, height, ref = _scene()
    res = calibrate_georeferenced(depth, labels, ref)
    sigma = build_confidence(res, labels)["sigma"]
    assert 0.8 < interval_coverage(res.dsm, sigma, height) < 0.98