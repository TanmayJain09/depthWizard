"""Evaluation metrics for elevation estimation 

All functions takes prediction and ground - truth arrays in the same units (meters), plus an optional boolean mask. 
Non finite pixels are always dropped
"""
import numpy as np

def _valid(pred, gt, mask = None) : 
    ok = np.isfinite(pred) & np.isfinite(gt)
    if mask is not None : 
        ok &= mask
    return pred[ok].astype(np.float64) , gt[ok].astype(np.float64)

def compute_metrics(pred, gt, mask = None) -> dict : 
    p , g = _valid(pred,gt,mask)
    n = int(p.size)

    if n<2 : 
        return {
            "n": n, 
            "rmse": np.nan, 
            "mae": np.nan, 
            "bias": np.nan, 
            "corr": np.nan
        }

    err = p - g
    corr = np.corrcoef(p,g)[0,1] if p.std() > 0 and g.std() > 0 else np.nan

    return {
        "n" : n,
        "rmse": float(np.sqrt(np.mean(err ** 2))),
        "mae": float(np.mean(np.abs(err))),
        "bias": float(np.mean(err)),   # mean signed error: shows systematic over/under-estimation
        "corr": float(corr),
    }

def per_class_metrics(pred, gt, labels, class_names: dict, ignore=255) -> dict:
    """Metrics per semantic class. class_names: {class_id: name}."""
    out = {}
    for cid, name in class_names.items():
        out[name] = compute_metrics(pred, gt, mask=(labels == cid) & (labels != ignore))
    return out


def affine_align(pred, gt, mask=None):
    """Best global scale-shift of pred onto gt (least squares).

    Used to judge a relative-depth backbone fairly: it removes the unknown
    scale and shift, so what remains is the shape quality of the depth map.
    Returns (aligned_pred_full_array, scale, shift).
    """
    p, g = _valid(pred, gt, mask)
    a, b = np.polyfit(p, g, 1)
    return a * pred + b, float(a), float(b)


def pool_metrics(results: list) -> dict:
    """Combine per-tile metric dicts into one pooled result.

    RMSE is pooled by pixel count (sqrt of weighted mean squared error), MAE and
    bias by weighted mean. Correlation cannot be pooled exactly, so the mean of
    per-tile correlations is returned.
    """
    r = [x for x in results if x["n"] > 1]
    if not r:
        return {
            "n": 0, 
            "rmse": np.nan, 
            "mae": np.nan, 
            "bias": np.nan, 
            "corr": np.nan
        }
    w = np.array([x["n"] for x in r], dtype=np.float64)
    w /= w.sum()
    return {
        "n": int(sum(x["n"] for x in r)),
        "rmse": float(np.sqrt(np.sum(w * np.array([x["rmse"] for x in r]) ** 2))),
        "mae": float(np.sum(w * np.array([x["mae"] for x in r]))),
        "bias": float(np.sum(w * np.array([x["bias"] for x in r]))),
        "corr": float(np.nanmean([x["corr"] for x in r])),
    }