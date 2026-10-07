"""Per-class scale-shift calibration of relative depth into height.

Measured on 30 DFC2019 tiles (256 sparse reference points, scored on held-out pixels):
per-class linear fit RMSE 2.94 m vs 3.70 m for one global fit, better on every tile.
A per-class quadratic added nothing, so the model stays linear.

Two modes:
  calibrate_georeferenced - least-squares fit per class against sparse reference heights.
  calibrate_relative      - EXPERIMENTAL, no reference: height priors + boundary consistency.
                            Not yet evaluated against ground truth.
"""
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import minimize

from .segmentation import GROUND, VEGETATION, BUILDING, WATER, IGNORE

CLASSES = (GROUND, VEGETATION, BUILDING, WATER)
MIN_REF_POINTS = 15       # reference points needed to fit a class on its own
MIN_CLASS_PIXELS = 200    # relative mode: pixels needed per class

# (mean, std) of height above ground in metres, used only by calibrate_relative
HEIGHT_PRIORS = {GROUND: (0.0, 1.0), VEGETATION: (8.0, 5.0), BUILDING: (12.0, 8.0), WATER: (0.0, 0.5)}


@dataclass
class CalibrationResult:
    dsm: np.ndarray                                    # calibrated heights (H, W), metres
    params: dict = field(default_factory=dict)         # {class_id: (scale, shift)}
    residual_std: dict = field(default_factory=dict)   # {class_id: held-out RMS error, metres}
    n_ref: dict = field(default_factory=dict)          # {class_id: reference points used}
    method: str = ""
    global_params: tuple = (1.0, 0.0)


def fit_line(x, y, robust=False, iters=10):
    """y ~ a*x + b. robust=True uses Huber reweighting (lower MAE, but higher RMSE on tall structures)."""
    a, b = np.polyfit(x, y, 1)
    if robust:
        for _ in range(iters):
            r = y - (a * x + b)
            s = 1.4826 * np.median(np.abs(r - np.median(r))) + 1e-6
            k = 1.345 * s
            w = np.where(np.abs(r) <= k, 1.0, k / np.maximum(np.abs(r), 1e-9))
            A = np.stack([x, np.ones_like(x)], 1) * np.sqrt(w)[:, None]
            a, b = np.linalg.lstsq(A, y * np.sqrt(w), rcond=None)[0]
    return float(a), float(b)


def _heldout_rms(x, y, robust, k=5, seed=0):
    """RMS error of the fit on points it was NOT fitted on (k-fold). Small samples use a dof correction."""
    n = len(x)
    if n < 2 * MIN_REF_POINTS:
        a, b = fit_line(x, y, robust)
        return float(np.sqrt(np.mean((y - (a * x + b)) ** 2) * n / max(n - 2, 1)))
    folds = np.random.default_rng(seed).permutation(n) % k
    res = np.full(n, np.nan)
    for f in range(k):
        tr, te = folds != f, folds == f
        if np.ptp(x[tr]) < 1e-6:
            continue
        a, b = fit_line(x[tr], y[tr], robust)
        res[te] = y[te] - (a * x[te] + b)
    return float(np.sqrt(np.nanmean(res ** 2)))


def calibrate_georeferenced(depth, labels, reference, robust=False) -> CalibrationResult:
    """reference: array shaped like depth, holding known heights in metres and NaN where unknown."""
    ok = np.isfinite(reference) & (labels != IGNORE)
    if ok.sum() < 2 or np.ptp(depth[ok]) < 1e-6:
        raise ValueError("Not enough usable reference points to calibrate.")

    xd, yd, ld = depth[ok].astype(np.float64), reference[ok].astype(np.float64), labels[ok]
    ga, gb = fit_line(xd, yd, robust)
    global_rms = _heldout_rms(xd, yd, robust)
    dsm = (ga * depth + gb).astype(np.float32)       # every pixel gets at least the global fit

    params, rstd, counts = {}, {}, {}
    for c in CLASSES:
        m = ld == c
        counts[c] = int(m.sum())
        if counts[c] >= MIN_REF_POINTS and np.ptp(xd[m]) > 1e-6:
            a, b = fit_line(xd[m], yd[m], robust)
            rstd[c] = _heldout_rms(xd[m], yd[m], robust)
        else:                                         # too few points: fall back to global
            a, b = ga, gb
            rstd[c] = global_rms
        params[c] = (a, b)
        sel = labels == c
        dsm[sel] = a * depth[sel] + b

    return CalibrationResult(dsm, params, rstd, counts, "georeferenced", (ga, gb))


def calibrate_relative(depth, labels, n_samples=50_000, seed=0) -> CalibrationResult:
    """EXPERIMENTAL. No reference: per-class scale/shift fitted to height priors and boundary jumps."""
    rng = np.random.default_rng(seed)
    classes = [c for c in CLASSES if (labels == c).sum() >= MIN_CLASS_PIXELS]
    if not classes:
        raise ValueError("No class has enough pixels to calibrate.")

    flat = depth.ravel()
    samples = {}
    for c in classes:
        idx = np.flatnonzero((labels == c).ravel())
        samples[c] = flat[rng.choice(idx, min(len(idx), n_samples), replace=False)]

    l1, l2, d1, d2 = labels[:, :-1], labels[:, 1:], depth[:, :-1], depth[:, 1:]
    cross = (l1 != l2) & np.isin(l1, classes) & np.isin(l2, classes)
    bi = np.flatnonzero(cross.ravel())
    if len(bi) > n_samples:
        bi = rng.choice(bi, n_samples, replace=False)
    bl1, bl2 = l1.ravel()[bi].astype(int), l2.ravel()[bi].astype(int)
    bd1, bd2 = d1.ravel()[bi], d2.ravel()[bi]
    prior_mean = np.array([HEIGHT_PRIORS[c][0] for c in sorted(CLASSES)])

    def unpack(theta):
        A, B = np.ones(len(CLASSES)), np.zeros(len(CLASSES))
        for i, c in enumerate(classes):
            A[c], B[c] = theta[2 * i], theta[2 * i + 1]
        return A, B

    def loss(theta):
        A, B = unpack(theta)
        total = 0.0
        for c in classes:
            h = A[c] * samples[c] + B[c]
            mu, sd = HEIGHT_PRIORS[c]
            total += ((h.mean() - mu) / sd) ** 2 + ((h.std() - sd) / sd) ** 2
        if len(bi):
            jump = (A[bl1] * bd1 + B[bl1]) - (A[bl2] * bd2 + B[bl2])
            total += 0.1 * np.mean(((jump - (prior_mean[bl1] - prior_mean[bl2])) / 5.0) ** 2)
        return total

    res = minimize(loss, np.tile([10.0, 0.0], len(classes)), method="L-BFGS-B")
    A, B = unpack(res.x)

    dsm = np.zeros(depth.shape, dtype=np.float32)
    params = {}
    for c in classes:
        params[c] = (float(A[c]), float(B[c]))
        sel = labels == c
        dsm[sel] = A[c] * depth[sel] + B[c]
    rstd = {c: HEIGHT_PRIORS[c][1] for c in classes}    # no reference: prior spread stands in as uncertainty
    return CalibrationResult(dsm, params, rstd, {}, "relative")