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

def segment_image(rgb : np.ndarray) -> np.ndarray : 
    """Predict semantic classes from an RGB image (H, W, 3).

    Needed for user uploads that come without labels. A model choice
    (e.g. a SegFormer trained on aerial data) is still to be decided,
    so this is a placeholder for now.
    """

    raise NotImplementedError("Image-only segmentation model not chosen yet")

def class_marks(labels : np.ndarray) -> dict : 
    """Return {class name, boolean mask} for the four main class"""
    return {name : labels == cid for cid, name in CLASS_NAMES.items()}