# Results

## Setup
- Dataset: DFC2019 Track 1 (RGB + reference DSM + semantic labels)
- Depth backbone: Depth Anything V2 Small
- Metrics: RMSE, MAE, correlation (`eval/metrics.py`)

## 1. Depth backbone baseline (notebook 01, 20 tiles)
- Mean raw correlation with reference: 0.512; no tile had negative correlation
- Global-fit RMSE: mean 4.01 m, median 3.02 m

Within-class correlation of raw depth:

| Class | Correlation |
|---|---|
| Building | 0.431 |
| Ground | 0.216 |
| Vegetation | 0.179 |
| Water | 0.161 |

## 2. Calibration experiments (notebook 02, 30 tiles, 256 sparse points, 5 seeds)

| Method | RMSE (m) | MAE (m) |
|---|---|---|
| Single global fit | 3.70 | 2.51 |
| **Per-class least squares** | **2.94** | **1.63** |
| Oracle per-class ceiling | 2.93 | n/a |

- Per-class beat global on all 30 tiles.
- Robust variants lowered MAE but raised RMSE.
- Shrinkage toward the global fit hurt (RMSE 3.14).
- Per-class quadratic gave no gain over linear (sparse RMSE 2.94 vs 2.94; won on 27% of tiles), so the model stays linear.
- Remaining error is mostly vegetation (4.35 m) and building (3.79 m); it comes from the backbone, not the calibration.

## 3. Full benchmark (`eval/run_benchmark.py`)
30 DFC2019 tiles, 256 sparse reference points per tile, 5 seeds, metrics pooled over all pixels (157M).

| Method | RMSE (m) | MAE (m) | Bias (m) | Correlation |
|---|---|---|---|---|
| Single global fit | 4.01 | 2.89 | -0.001 | 0.610 |
| **Per-class (ours)** | **2.81** | **1.64** | 0.002 | **0.833** |

Per-class calibration reduces RMSE by 30% and MAE by 43%, and beat the global fit on 100% of tiles.

By terrain type:

| Terrain | RMSE (m) | MAE (m) | Correlation |
|---|---|---|---|
| Urban | <<>> | <<>> | <<>> |
| Sparse | <<>> | <<>> | <<>> |
| Hilly | <<>> | <<>> | <<>> |
| Forested | <<>> | <<>> | <<>> |

## 4. Confidence map
<<HOW CONFIDENCE RELATES TO ACTUAL ERROR: add a figure or correlation if measured>>

## 5. Figures
<<INPUT vs PREDICTED DSM>>
<<CONFIDENCE MAP>>
<<3D VIEWER SCREENSHOT>>

## 6. Limitations
- Vegetation and building classes carry most of the remaining error
- Larger depth backbone (Base/Large) not yet tested: <<UPDATE IF TESTED>>