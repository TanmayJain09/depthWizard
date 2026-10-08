"""Orchestrates stages 1-4 and returns arrays + metadata for the API."""
import numpy as np

from .calibration import calibrate_georeferenced, calibrate_relative
from .confidence import build_confidence, class_summary
from .depth_inference import predict_relative_depth
from .input_handler import (_as_path_or_bytes, check_shapes, inspect_georef,
                            load_image, load_labels, load_reference)
from .srtm import srtm_reference


def run_pipeline(image_src, labels_src, reference_src=None, dfc_labels=False, robust=False, jid=None):
    from .segmentation import segment_image
    from api import jobs
    
    image_src = _as_path_or_bytes(image_src)          # read the upload once
    geo = inspect_georef(image_src)                   # stage 1: is_georeferenced flag
    image, exif_transposed = load_image(image_src)
    geo["exif_transposed"] = exif_transposed
    
    if jid:
        jobs.set_job(jid, stage="depth")
    depth = predict_relative_depth(image)
    
    if labels_src is None:
        if jid:
            jobs.set_job(jid, stage="segmentation")
        labels, seg_source, seg_warning = segment_image(np.array(image.convert("RGB")), depth)
        geo["segmentation_source"] = seg_source
        if seg_warning:
            geo["segmentation_warning"] = seg_warning
    else:
        labels = load_labels(labels_src, dfc=dfc_labels)
        geo["segmentation_source"] = "user"
        
    check_shapes(depth=depth, labels=labels)

    if reference_src is not None:
        reference = load_reference(reference_src)
        geo["height_datum"] = "custom_reference"
    else:
        reference = None
        
    if reference is None and geo["is_georeferenced"]:
        try:
            reference = srtm_reference(image_src, labels)
            geo["height_datum"] = "WGS84_EGM96"
        except Exception as e:                        # no internet, void tile, etc.
            geo["srtm_error"] = str(e)                # falls back to relative mode

    if jid:
        jobs.set_job(jid, stage="calibration")

    if reference is not None:
        check_shapes(depth=depth, reference=reference)
        result = calibrate_georeferenced(depth, labels, reference, robust=robust)
    else:
        result = calibrate_relative(depth, labels)

    if result.method == "relative":
        dsm_min = float(np.nanmin(result.dsm))
        dsm_max = float(np.nanmax(result.dsm))
        geo["approx_height_range_m"] = [dsm_min, dsm_max]

    conf = build_confidence(result, labels)
    return {"image": image, "labels": labels, "depth": depth, "result": result,
            "conf": conf, "summary": class_summary(result), "geo": geo}