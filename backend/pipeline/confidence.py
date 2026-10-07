"""Per-pixel uncertainty and confidence from a CalibrationResult.

Uncertainty (sigma, metres) is the held-out RMS error of the pixel's class,
taken from calibration. Pixels whose class has no estimate (ignore label, or a
class skipped in relative mode) get the largest class sigma, so they are never
reported as more certain than the worst class.

Intervals assume roughly Gaussian errors. Use interval_coverage() to check how
true that is on held-out pixels before quoting any coverage number.
"""

import numpy as np
from .calibration import CalibrationResult
from .segmentation import CLASS_NAMES

Z90 = 1.645 #z - score for the two sided 90% interval 
MAX_SIGMA = 8.0 # sigma at or above the confidence level

def uncertainty_map(result: CalibrationResult, labels: np.ndarray) -> np.ndarray:
    """(H, W) float32 sigma in metres."""
    if not result.residual_std:
        raise ValueError("CalibrationResult has no residual_std to build uncertainty from.")
    sigma = np.full(labels.shape, max(result.residual_std.values()), dtype=np.float32)
    for c, s in result.residual_std.items():
        sigma[labels == c] = s
    return sigma


def confidence_map(sigma: np.ndarray, max_sigma: float = MAX_SIGMA) -> np.ndarray:
    """(H, W) float32 in [0, 1]. 1 = sigma of 0 m, 0 = sigma >= max_sigma."""
    return np.clip(1.0 - sigma / max_sigma, 0.0, 1.0).astype(np.float32)


def build_confidence(result: CalibrationResult, labels: np.ndarray, z: float = Z90) -> dict:
    """Everything the API returns alongside the DSM."""
    sigma = uncertainty_map(result, labels)
    return {
        "sigma": sigma,
        "confidence": confidence_map(sigma),
        "lower": (result.dsm - z * sigma).astype(np.float32),
        "upper": (result.dsm + z * sigma).astype(np.float32),
    }


def class_summary(result: CalibrationResult) -> dict:
    """{class name: {rmse, n_ref, scale, shift}} for JSON responses."""
    out = {}
    for c, (a, b) in result.params.items():
        out[CLASS_NAMES[c]] = {
            "rmse": float(result.residual_std.get(c, np.nan)),
            "n_ref": int(result.n_ref.get(c, 0)),
            "scale": float(a),
            "shift": float(b),
        }
    return out


def interval_coverage(dsm, sigma, gt, mask=None, z: float = Z90) -> float:
    """Fraction of valid pixels whose true height lies within dsm +/- z*sigma.

    A well-calibrated 90% interval gives ~0.90. Much lower means the
    uncertainty is overconfident (typical on tall structures).
    """
    ok = np.isfinite(dsm) & np.isfinite(gt) & np.isfinite(sigma)
    if mask is not None:
        ok &= mask
    if not ok.any():
        return float("nan")
    return float(np.mean(np.abs(dsm[ok] - gt[ok]) <= z * sigma[ok]))