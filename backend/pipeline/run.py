"""Orchestrates stages 1-4 and returns arrays + metadata for the API."""
import numpy as np

from .calibration import calibrate_georeferenced, calibrate_relative
from .confidence import build_confidence, class_summary
from .depth_inference import predict_relative_depth
from .input_handler import (_as_path_or_bytes, check_shapes, inspect_georef,
                            load_image, load_labels, load_reference)
from .srtm import srtm_reference


def run_pipeline(image_src, labels_src, reference_src=None, dfc_labels=False, robust=False):
    image_src = _as_path_or_bytes(image_src)          # read the upload once
    geo = inspect_georef(image_src)                   # stage 1: is_georeferenced flag
    image = load_image(image_src)
    labels = load_labels(labels_src, dfc=dfc_labels)
    depth = predict_relative_depth(image)
    check_shapes(depth=depth, labels=labels)

    reference = load_reference(reference_src) if reference_src is not None else None
    if reference is None and geo["is_georeferenced"]:
        try:
            reference = srtm_reference(image_src, labels)
        except Exception as e:                        # no internet, void tile, etc.
            geo["srtm_error"] = str(e)                # falls back to relative mode

    if reference is not None:
        check_shapes(depth=depth, reference=reference)
        result = calibrate_georeferenced(depth, labels, reference, robust=robust)
    else:
        result = calibrate_relative(depth, labels)

    conf = build_confidence(result, labels)
    return {"image": image, "labels": labels, "depth": depth, "result": result,
            "conf": conf, "summary": class_summary(result), "geo": geo}