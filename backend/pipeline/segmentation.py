"""Semantic class extraction,
Unified class IDs used across the whole pipeline (calibration, confidence, API) : 
    0 : ground,
    1 : vegetation,
    2 : building,
    3 : water,
    255 : ignore / unlabeled
"""

import numpy as np

GROUND, VEGETATION, BUILDING, WATER, IGNORE = 0, 1, 2, 3, 255

CLASS_NAMES = {GROUND : "ground" , VEGETATION : "vegetation", BUILDING : "building", WATER : "water", IGNORE : "ignore"}

#DFC2019 _CLS codes -> unified IDs.(
#Bridge / elevated road (17) is folded into ground ; unlabeled (65) is ignored
_DFC_LUT = np.full(256, IGNORE, dtype=np.uint8)
_DFC_LUT[2] = GROUND
_DFC_LUT[5] = VEGETATION
_DFC_LUT[6] = BUILDING
_DFC_LUT[9] = WATER
_DFC_LUT[17] = GROUND

def remap_dfc_labels(cls : np.ndarray) -> np.ndarray : 
    """Convert a DFC2019 label raster (h,w) to unified class ID"""
    return _DFC_LUT[np.clip(cls,0,255).astype(np.uint8)]

import os
import json
import cv2
from pathlib import Path
from PIL import Image

def heuristic_segmentation(rgb: np.ndarray, depth: np.ndarray) -> np.ndarray:
    """
    Heuristic segmentation.
    """
    h, w, _ = rgb.shape
    
    # 1. Vegetation via ExG
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    
    denom = r + g + b
    denom[denom == 0] = 1.0
    r_n = r / denom
    g_n = g / denom
    b_n = b / denom
    
    exg = 2 * g_n - r_n - b_n
    
    exg_uint8 = cv2.normalize(exg, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
    _, veg_mask = cv2.threshold(exg_uint8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # 2. Water
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat = hsv[..., 1]
    val = hsv[..., 2]
    
    water_mask = ((sat < 50) & (val < 100)) | ((b_n > r_n) & (b_n > g_n) & (sat < 80))
    water_mask = water_mask.astype(np.uint8) * 255
    
    # 3. Building via White top-hat on depth
    if depth is not None:
        valid_depth = depth[~np.isnan(depth)]
        if len(valid_depth) > 0:
            d_min, d_max = np.nanmin(depth), np.nanmax(depth)
            d_span = d_max - d_min if d_max > d_min else 1.0
            depth_norm = np.clip((depth - d_min) / d_span * 255, 0, 255).astype(np.uint8)
        else:
            depth_norm = np.zeros_like(depth, dtype=np.uint8)
            
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))
        tophat = cv2.morphologyEx(depth_norm, cv2.MORPH_TOPHAT, kernel)
        _, bldg_mask = cv2.threshold(tophat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        bldg_mask = np.zeros((h, w), dtype=np.uint8)
    
    # Morphology cleaning
    kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    veg_mask = cv2.morphologyEx(veg_mask, cv2.MORPH_OPEN, kernel_small)
    water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_OPEN, kernel_small)
    bldg_mask = cv2.morphologyEx(bldg_mask, cv2.MORPH_OPEN, kernel_small)
    
    # Priority: Building > Water > Vegetation > Ground
    seg = np.zeros((h, w), dtype=np.uint8)  # Ground is 0
    seg[veg_mask > 0] = VEGETATION
    seg[water_mask > 0] = WATER
    seg[bldg_mask > 0] = BUILDING
    
    seg[(bldg_mask > 0) & ((veg_mask > 0) | (water_mask > 0))] = GROUND
    
    return seg

class ModelSegmenter:
    def __init__(self, model_id: str):
        self.model_id = model_id
        self.model = None
        self.processor = None
        self.mapping = None
        
        map_file = Path(__file__).parent / "segmentation_maps.json"
        if not map_file.exists():
            raise FileNotFoundError("segmentation_maps.json not found")
        
        with open(map_file) as f:
            maps = json.load(f)
            
        map_name = "LoveDA" if "loveda" in model_id.lower() else "Potsdam" if "potsdam" in model_id.lower() else "LoveDA"
            
        if map_name not in maps:
            raise ValueError(f"No mapping found for {map_name}")
            
        self.mapping = maps[map_name]
        
    def load(self):
        from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation
        self.processor = AutoImageProcessor.from_pretrained(self.model_id)
        self.model = AutoModelForSemanticSegmentation.from_pretrained(self.model_id)

    def segment(self, rgb: np.ndarray) -> np.ndarray:
        if self.model is None:
            self.load()
            
        import torch
        from torch import nn
        
        image = Image.fromarray(rgb)
        inputs = self.processor(images=image, return_tensors="pt")
        with torch.no_grad():
            outputs = self.model(**inputs)
            
        logits = outputs.logits
        upsampled_logits = nn.functional.interpolate(
            logits,
            size=image.size[::-1],
            mode="bilinear",
            align_corners=False,
        )
        pred = upsampled_logits.argmax(dim=1)[0].cpu().numpy()
        
        id2label = self.model.config.id2label
        mapped = np.full_like(pred, IGNORE, dtype=np.uint8)
        
        for model_id, label_name in id2label.items():
            unified_id = self.mapping.get(label_name, IGNORE)
            mapped[pred == int(model_id)] = unified_id
            
        return mapped

_segmenter = None
_active_backend = "heuristic"

def get_segmenter():
    global _segmenter, _active_backend
    backend_env = os.environ.get("SEGMENTATION_BACKEND", "heuristic")
    
    if backend_env == "model":
        model_id = os.environ.get("SEGMENTATION_MODEL_ID")
        if not model_id:
            _active_backend = "heuristic"
            return None, "model unavailable: missing SEGMENTATION_MODEL_ID"
            
        if _segmenter is None:
            try:
                _segmenter = ModelSegmenter(model_id)
                _segmenter.load()
                _active_backend = "model"
            except Exception as e:
                _segmenter = None
                _active_backend = "heuristic"
                return None, f"model unavailable: {e}"
        return _segmenter, None
        
    _active_backend = "heuristic"
    return None, None

def active_backend():
    return _active_backend

def segment_image(rgb: np.ndarray, depth: np.ndarray = None) -> tuple:
    """
    Returns (segmentation_mask, source, warning)
    """
    backend_env = os.environ.get("SEGMENTATION_BACKEND", "heuristic")
    
    if backend_env == "model":
        segmenter, warning = get_segmenter()
        if segmenter is not None:
            try:
                mask = segmenter.segment(rgb)
                return mask, "model", None
            except Exception as e:
                return heuristic_segmentation(rgb, depth), "heuristic", f"model unavailable during inference: {e}"
        else:
            return heuristic_segmentation(rgb, depth), "heuristic", warning
            
    return heuristic_segmentation(rgb, depth), "heuristic", "heuristic segmentation: treat building heights as approximate"

def class_marks(labels : np.ndarray) -> dict : 
    """Return {class name, boolean mask} for the four main class"""
    return {name : labels == cid for cid, name in CLASS_NAMES.items()}