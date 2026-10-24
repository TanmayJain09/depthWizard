"""Benchmark on DFC2019 tiles: global fit vs per-class calibration.

Run from the repo root:
    python eval/run_benchmark.py --n 30 --points 256 --seeds 5
Writes eval/results/benchmark_tiles.csv and eval/results/benchmark_summary.json
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from eval.metrics import affine_align, compute_metrics, per_class_metrics, pool_metrics  # noqa: E402
from pipeline.calibration import calibrate_georeferenced  # noqa: E402
from pipeline.depth_inference import predict_relative_depth  # noqa: E402
from pipeline.input_handler import load_image, load_labels, load_reference  # noqa: E402

RAW = ROOT / "data" / "raw"
OUT = ROOT / "eval" / "results"
CLASS_NAMES = {0: "ground", 1: "vegetation", 2: "building", 3: "water"}  # CHECK: match your label mapping


def pred_dsm(result):
    return result.dsm


def find_tiles(n):
    """CHECK: assumes DFC2019 names like JAX_004_006_RGB.tif / _AGL.tif / _CLS.tif."""
    tiles = []
    for rgb in sorted(RAW.rglob("*_RGB.tif")):
        agl = next(RAW.rglob(rgb.name.replace("_RGB", "_AGL")), None)
        cls = next(RAW.rglob(rgb.name.replace("_RGB", "_CLS")), None)
        if agl and cls:
            tiles.append((rgb, agl, cls))
    return tiles[:n]


def sparse_reference(gt, k, rng):
    """Keep k random valid points of the reference, NaN elsewhere."""
    ref = np.full_like(gt, np.nan, dtype="float32")
    ys, xs = np.where(np.isfinite(gt))
    idx = rng.choice(len(ys), size=min(k, len(ys)), replace=False)
    ref[ys[idx], xs[idx]] = gt[ys[idx], xs[idx]]
    return ref


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--points", type=int, default=256)
    ap.add_argument("--seeds", type=int, default=5)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    tiles = find_tiles(args.n)
    if not tiles:
        sys.exit(f"No tiles found under {RAW}. Run data/download_dfc2019.py first.")

    rows, glob_res, cls_res = [], [], []
    for rgb, agl, cls in tiles:
        image = load_image(str(rgb))
        labels = load_labels(str(cls), dfc=True)
        gt = load_reference(str(agl))
        depth = predict_relative_depth(image)

        for seed in range(args.seeds):
            rng = np.random.default_rng(seed)
            ref = sparse_reference(gt, args.points, rng)

            # Baseline: one global scale-shift fitted on the same sparse points
            g_pred = affine_align(depth, ref)
            g_pred = g_pred[0] if isinstance(g_pred, tuple) else g_pred
            g = compute_metrics(g_pred, gt)

            # Ours: per-class calibration
            c_pred = pred_dsm(calibrate_georeferenced(depth, labels, ref))
            c = compute_metrics(c_pred, gt)
            pc = per_class_metrics(c_pred, gt, labels, CLASS_NAMES)

            glob_res.append(g)
            cls_res.append(c)
            rows.append({"tile": rgb.stem, "seed": seed,
                         "global_rmse": g["rmse"], "global_mae": g["mae"],
                         "perclass_rmse": c["rmse"], "perclass_mae": c["mae"],
                         "per_class": json.dumps(pc, default=float)})
        print(f"done {rgb.stem}")

    df = pd.DataFrame(rows)
    df.to_csv(OUT / "benchmark_tiles.csv", index=False)

    summary = {"tiles": len(tiles), "points": args.points, "seeds": args.seeds,
               "global": pool_metrics(glob_res), "per_class": pool_metrics(cls_res),
               "per_class_wins_tiles": float(
                   (df.groupby("tile")["perclass_rmse"].mean()
                    < df.groupby("tile")["global_rmse"].mean()).mean())}
    (OUT / "benchmark_summary.json").write_text(json.dumps(summary, indent=2, default=float))
    print(json.dumps(summary, indent=2, default=float))


if __name__ == "__main__":
    main()