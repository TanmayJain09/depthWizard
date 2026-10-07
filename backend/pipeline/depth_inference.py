"""Monocular Depth Inference using the Depth ANything V2"""
from functools import lru_cache

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf" #update the samll to big for better results
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

