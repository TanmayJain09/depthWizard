import os
import glob
import json
import numpy as np
from pathlib import Path
from PIL import Image

import sys
sys.path.append(str(Path(__file__).resolve().parents[1]))
from pipeline.segmentation import segment_image, remap_dfc_labels, IGNORE, GROUND, VEGETATION, BUILDING, WATER, CLASS_NAMES
from pipeline.depth_inference import predict_relative_depth

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

def calculate_iou(pred, target, num_classes=4):
    ious = {}
    for cls in [GROUND, VEGETATION, BUILDING, WATER]:
        pred_cls = (pred == cls)
        target_cls = (target == cls)
        
        intersection = np.logical_and(pred_cls, target_cls).sum()
        union = np.logical_or(pred_cls, target_cls).sum()
        
        if union == 0:
            ious[CLASS_NAMES[cls]] = np.nan
        else:
            ious[CLASS_NAMES[cls]] = float(intersection / union)
            
    return ious

def evaluate():
    print("Looking for DFC2019 dataset...")
    
    # Try to find DFC tiles
    # Assuming data/dfc/ contains images ending in _RGB.tif and labels ending in _CLS.tif
    rgb_files = sorted(glob.glob(str(DATA_DIR / "**/*_RGB.tif"), recursive=True))
    cls_files = sorted(glob.glob(str(DATA_DIR / "**/*_CLS.tif"), recursive=True))
    
    has_real_data = len(rgb_files) > 0 and len(rgb_files) == len(cls_files)
    
    if not has_real_data:
        print("DFC2019 dataset not found. Generating a synthetic scene...")
        # Generate a synthetic RGB image (256x256)
        # Top half sky/water, bottom left ground, bottom right building/vegetation
        rgb = np.zeros((256, 256, 3), dtype=np.uint8)
        target = np.full((256, 256), IGNORE, dtype=np.uint8)
        
        # Water
        rgb[0:128, :] = [20, 50, 150]
        target[0:128, :] = WATER
        
        # Ground
        rgb[128:, 0:128] = [120, 100, 80]
        target[128:, 0:128] = GROUND
        
        # Vegetation
        rgb[128:200, 128:] = [30, 120, 40]
        target[128:200, 128:] = VEGETATION
        
        # Building (gray roof)
        rgb[200:, 128:] = [180, 180, 180]
        target[200:, 128:] = BUILDING
        
        image_list = [Image.fromarray(rgb)]
        target_list = [target]
    else:
        print(f"Found {len(rgb_files)} DFC pairs. Evaluating...")
        image_list = [Image.open(f) for f in rgb_files]
        target_list = [remap_dfc_labels(np.array(Image.open(f))) for f in cls_files]
        
    all_ious = {name: [] for name in CLASS_NAMES.values() if name != "ignore"}
    total_correct = 0
    total_valid = 0
    
    for img, tgt in zip(image_list, target_list):
        rgb_arr = np.array(img.convert("RGB"))
        depth = predict_relative_depth(img)
        
        pred, source, warning = segment_image(rgb_arr, depth)
        
        valid_mask = tgt != IGNORE
        if not np.any(valid_mask):
            continue
            
        correct = (pred == tgt) & valid_mask
        total_correct += correct.sum()
        total_valid += valid_mask.sum()
        
        ious = calculate_iou(pred[valid_mask], tgt[valid_mask])
        for k, v in ious.items():
            if not np.isnan(v):
                all_ious[k].append(v)
                
    overall_acc = total_correct / total_valid if total_valid > 0 else 0
    
    mean_ious = {k: np.mean(v) if len(v) > 0 else 0 for k, v in all_ious.items()}
    mIoU = np.mean(list(mean_ious.values()))
    
    results = {
        "data_source": "DFC2019" if has_real_data else "Synthetic",
        "segmentation_backend": os.environ.get("SEGMENTATION_BACKEND", "heuristic"),
        "model_id": os.environ.get("SEGMENTATION_MODEL_ID", None),
        "overall_accuracy": overall_acc,
        "mIoU": mIoU,
        "per_class_iou": mean_ious
    }
    
    print("\n--- Evaluation Results ---")
    print(json.dumps(results, indent=2))
    
    out_file = RESULTS_DIR / f"eval_{results['segmentation_backend']}.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
        
    print(f"Saved to {out_file}")
    
if __name__ == "__main__":
    evaluate()
