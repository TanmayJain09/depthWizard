"""Per-class scale shift calibration of relative depth into elevation

Two Mode : 
    - calibrated_georeferenced : least square fit (numpy.polyfit) per class against refernce heights (SRTM / GCP / DFC2019 AGL during benchmaking)
    - calibrated_relative : spicy.optimize with class height prior and boundary consistency, for input with no reference, output is approximate meter, not absolute
"""

from dataclasses import dataclass, field
import numpy as np
from scipy.optimize import minimize
from .segmentation import CLASS_NAMES, IGNORE

MIN_POINTS = 200 #below this, class fails back to the global fit

HEIGHT_PRIORS = {
    0 : (0.0,1.0),  #ground
    1 : (8.0,5.0),  #vegetation
    2 : (12.0,8.0), #building
    3 : (0.0,0.5),  #water
}

@dataclass
class CalibrationResult : 
    dsm : np.ndarray                                    #calibrated
    params : dict = field(default_factory=dict)         # {class_id : (scale,shift)}
    residual_std : dict = field(default_factory=dict)   # {class_id : std of fit error}
    method : str = ""

def _apply(depth, labels, params) : 
    out = np.zeros_like(depth, dtype=np.float32)
    for cid, (a,b) in params.items() : 
        m = labels == cid
        out[m] = a * depth[m] + b
    return out

def calibrate_georeferenced(depth, labels, reference, valid = None) -> CalibrationResult : 
    """Fit Height = a*depth + b seperately for each class via least square"""
    ok = np.isfinite(reference) & (labels!= IGNORE)
    if valid is not None : 
        ok &= valid

    #global fit for fallback for classes
    if ok.sum() < 2 : 
        raise ValueError("Not enough valid reference points to calibrate")
    
    ga,gb = np.polyfit(depth[ok],reference[ok],1)

    param , resid = {} , {}
    
    for cid in CLASS_NAMES : 
        m = ok & (labels == cid)
        if m.sum() > 0 : 
            resid[cid] = float(np.std(reference[m] - (a*depth[m] + b)))
        else : 
            resid[cid] = float("nan")

    return CalibrationResult(_apply(depth,labels,params), params, resid, "georeferenced")
