# DepthWizard Architecture

## 1. Goal
Estimate an elevation map (DSM) from a single aerial/satellite image, and tell
the user how much to trust it. A foundation model gives relative depth; we
convert it to elevation with a calibration step that respects what is in the
scene (buildings, vegetation, ground, water) and attach a confidence map.

## 2. System overview

```
 Frontend (React + Three.js)            Backend (FastAPI)
 ┌───────────────────────┐   upload    ┌──────────────────────────────┐
 │ UploadFlow            │────────────▶│ api/routes.py                │
 │ TerrainViewer (3D)    │   job ID    │ api/jobs.py (async jobs)     │
 │ ValidationPanel       │◀────────────│ api/schemas.py               │
 │ Inspector / Export    │  result URLs│        │                     │
 └───────────────────────┘             │        ▼                     │
                                       │ pipeline/run.py              │
                                       └──────────────────────────────┘
```

The frontend and backend meet at one contract:
`frontend/docs/BACKEND_CONTRACT.md`. The frontend can run on mock data
(`frontend/public/mock`) when the backend is not available.

## 3. Pipeline (`backend/pipeline/`)

| Stage | File | What it does |
|---|---|---|
| 1. Input | `input_handler.py` | Loads image, labels, optional reference; checks shapes; detects georeferencing with rasterio |
| 2. Segmentation | `segmentation.py` | Extracts semantic classes: building, vegetation, ground, water |
| 3. Depth | `depth_inference.py` | Relative monocular depth from Depth Anything V2 (pretrained) |
| 4. Reference | `srtm.py` | For georeferenced input with no reference supplied, fetches SRTM elevation; on failure falls back to relative mode |
| 5. Calibration | `calibration.py` | The core contribution: per-class scale-shift |
| 6. Confidence | `confidence.py` | Builds the confidence map and per-class summary |
| Orchestration | `run.py` | `run_pipeline(...)` runs the stages and returns arrays plus metadata |

### Input modes
- **Georeferenced (GeoTIFF):** absolute DSM in metres, calibrated against SRTM
  or user-supplied ground control points / reference raster.
- **Non-georeferenced (PNG/JPG):** relative DSM, calibrated with constrained
  optimization using height priors and boundary consistency.

The backend detects georeferencing itself, so the frontend does not need to
distinguish file types.

### Calibration (core idea)
A single global scale-shift treats a roof and a tree canopy the same. We fit a
separate scale and shift per semantic class:
- Georeferenced: one least-squares linear fit per class (`numpy.polyfit`).
- Non-georeferenced: `scipy.optimize` with height priors per class.

Experiments (notebook 02) showed the linear per-class model is already close to
its oracle ceiling; a quadratic per-class fit gave no gain. Remaining error
comes from the depth backbone, mainly on vegetation and buildings.

## 4. API (`backend/api/`)
Async job pattern, so the UI stays responsive on slow inference:

1. `POST /api/reconstruct`: submit image (+ labels, optional reference); returns a job ID
2. Poll or stream job status
3. Fetch result URLs (DSM, confidence map, summary) when done

Jobs are tracked in `jobs.py`; request/response models in `schemas.py`.
Generated files go to `backend/outputs/`.

## 5. Frontend (`frontend/`)
- `TerrainViewer`: 3D terrain from the returned heightmap plus metadata
- `ValidationPanel` and `charts/`: error histogram, density scatter, swipe comparison, region drawer
- `core/terrain.worker.ts`, `validation.worker.ts`: heavy work off the main thread
- `core/proj_registry.ts`: coordinate reference systems for GeoTIFFs
- Electron wrapper (`electron/`) for desktop packaging

## 6. Design decisions
- **Depth Anything V2** is used pretrained, so no training from scratch is needed.
- **DFC2019** bundles RGB, LiDAR-derived DSM ground truth and semantic labels, so it is the most self-contained benchmark.
- **Async jobs** over a blocking request, because inference is slow and the UI needs progress.
- **Linear per-class calibration** kept after measuring nonlinear alternatives.

## 7. Evaluation
Metrics (`eval/metrics.py`): RMSE, MAE, correlation, overall and per class.
Benchmark protocol and numbers: see `docs/results.md`.