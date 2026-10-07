"""Monocular Depth Inference using the Depth ANything V2"""
from functools import lru_cache

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf" #update the samll to big for better results
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

@lru_cache(maxsize=1)
def _load_model() :
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID).to(DEVICE).eval()
    return processor,model

def predict_relative_depth(image : Image.Image) -> np.ndarray : 
    """
    Run Depth Anything V2 on an RGB image.

    Returns a float32 array (H, W) at the ORIGINAL image resolution,
    normalised to [0, 1]. Higher value = closer to the camera. For a
    top-down aerial view that roughly means higher elevation.
    This is relative depth only: it still needs per-class scale-shift
    calibration (calibration.py) to become metres.
    """

    processor , model = _load_model()
    image = image.convert("RGB")
    inputs = processor(images = image, return_tensors = "pt").to(DEVICE)

    with torch.no_grad():
        outputs = model(**inputs)

    depth = torch.nn.functional.interpolate(
        outputs.predicted_depth.unsqueeze(1),
        size = image.size[::-1],
        mode = "bicubic",
        align_corners = False,
    ).squeeze().cpu().numpy()

    depth = depth.astype(np.float32)
    rng = depth.max() - depth.min()
    return (depth - depth.min()) / rng if rng>0 else np.zeros_like(depth)