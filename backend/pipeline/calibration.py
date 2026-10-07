"""Per-class scale shift calibration of relative depth into elevation

Two Mode : 
    - calibrate_georeferenced : least square fit (numpy.polyfit) per class against refernce heights (SRTM / GCP / DFC2019 AGL during benchmaking)
    - calibrate_relative : scipy.optimize with class height priority and boundary consistency, for input with no reference, output is approximate meter, not absolute
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

    params , resid = {} , {}
    
    for cid in CLASS_NAMES : 
        m = ok & (labels == cid)
        if m.sum() >= MIN_POINTS : 
            a,b = np.polyfit(depth[m], reference[m], 1)
        else :
            a,b = ga,gb

        params[cid] = (float(a),float(b))
        pts = labels == cid
        
        if m.sum() > 0 : 
            resid[cid] = float(np.std(reference[m] - (a*depth[m] + b)))
        else : 
            resid[cid] = float("nan")

    return CalibrationResult(_apply(depth,labels,params), params, resid, "georeferenced")

def calibrate_relative(depth, labels, n_sample = 50000, seed=0) -> CalibrationResult : 
    """No reference : fit per class scale / shift to height priority + boundary consistency"""

    rng = np.random.default_rng(seed)
    classes = [c for c in CLASS_NAMES if (labels == c).sum() >= MIN_POINTS]

    if not classes : 
        raise ValueError("No class has enough pixel to calibrate")

    #sample pixels per class (keeps the optimiser fast)
    samples = {}

    for c in classes : 
        idx = np.flatnonzero((labels==c).ravel())
        samples[c] = depth.ravel()[
            rng.choice(
                idx,
                min(len(idx),n_sample),
                replace=False
            )
        ]

    #horizontal label pair creates the class boundary
    l1, l2 = labels[:,:-1] , labels[:,1:]
    d1, d2 = depth[:,:-1] , depth[:,1:]

    cross = (l1 != l2) & (np.isin(l1,classes)) & (np.isin(l2,classes))

    bi = np.flatnonzero(cross.ravel())
    if len(bi) > n_sample : 
        bi = rng.choice(bi, n_sample, replace=False)

    bl1, bl2 = l1.ravel()[bi], l2.ravel()[bi]
    bd1, bd2 = d1.ravel()[bi], d2.ravel()[bi]

    def loss(theta) : 
        p = {
            c: (theta[2*i], theta[2*i+1])
            for i,c in enumerate(classes)
        }

        total = 0.0

        #1) heigth prior : class mean should look plausible
        for c in classes : 
            a, b = p[c]
            h = a * samples[c] + b
            mu, sd = HEIGHT_PRIORS[c]
            total += ((h.mean() - mu) / sd) ** 2 + ((h.std() - sd)/sd) ** 2

        if len(bi):
            a1 = np.array([p[c][0] for c in bl1]); b1 = np.array([p[c][1] for c in bl1])
            a2 = np.array([p[c][0] for c in bl2]); b2 = np.array([p[c][1] for c in bl2])
            jump = (a1 * bd1 + b1) - (a2 * bd2 + b2)
            prior = np.array([HEIGHT_PRIORS[c][0] for c in bl1]) - np.array([HEIGHT_PRIORS[c][0] for c in bl2])
            total += 0.1 * np.mean(((jump - prior) / 5.0) ** 2)
        
        return total

    theta0 = np.tile([10.0, 0.0], len(classes))
    res = minimize(loss,theta0, method="L-BFGS-B")

    params = {c: (float(res.x[2 * i]), float(res.x[2 * i + 1])) for i, c in enumerate(classes)}
    resid = {c: HEIGHT_PRIORS[c][1] for c in classes}  # no reference: use prior spread as uncertainty
    return CalibrationResult(_apply(depth, labels, params), params, resid, "relative")