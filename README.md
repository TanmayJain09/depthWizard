<div align="center">
<h1> DepthWizard </h1>
Semantic-aware uncertainty calibration for single-view DSM (elevation) estimation.
</div>

<<DEMO GIF OR HERO SCREENSHOT>>

## Overview
DepthWizard turns a single aerial/satellite image into a calibrated elevation
map. Instead of one global scale factor, it fits a separate scale-shift per
semantic class (building, vegetation, ground, water) and outputs a confidence
map alongside the DSM. Benchmarked on DFC2019.

## Features
- Monocular relative depth from Depth Anything V2 (pretrained, no training from scratch)
- Per-class scale-shift calibration
- Confidence map generation
- Two input modes: PNG/JPG (relative DSM) and GeoTIFF (absolute DSM in metres,
  calibrated against SRTM or ground control points)
- Async FastAPI backend with job IDs
- React + Three.js viewer with 3D terrain, validation charts, and Electron packaging

## Architecture
<<INSERT ARCHITECTURE DIAGRAM>>

Pipeline: `segmentation` → `depth_inference` → `calibration` → `confidence`
(orchestrated by `backend/pipeline/run.py`).

API contract between backend and frontend: `frontend/docs/BACKEND_CONTRACT.md`.

## Repo Structure
```
DepthWizard/
├── backend/
│   ├── api/          # FastAPI: main, routes, jobs, schemas
│   ├── pipeline/     # segmentation, depth_inference, calibration, confidence,
│   │                 # srtm, input_handler, run
│   ├── tests/        # API, calibration, confidence, georef, input handler
│   ├── outputs/      # generated results
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/         # React + Three.js + Electron viewer
├── data/             # DFC2019 / SRTM download scripts
├── eval/             # metrics and benchmark results
├── models/checkpoints/
├── notebooks/        # 01 backbone eval, 02 calibration experiments
└── README.md
```

## Setup

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # optional
uvicorn api.main:app --reload
```
API runs at `http://localhost:8000` (docs at `/docs`).

### Frontend
```bash
cd frontend
npm install
npm run dev
```
<<VERIFY COMMANDS AGAINST package.json>> The frontend can run on mock data
(`frontend/public/mock`) without the backend.

### Docker (backend)
```bash
cd backend
docker build -t depthwizard-api .
docker run -p 8000:8000 depthwizard-api
```

## Data
```bash
python data/download_dfc2019.py     # DFC2019 Track 1 into data/raw
python data/download_srtm.py        # <<DESCRIBE STATUS>>
```
Model weights: <<WHERE THEY DOWNLOAD / WHERE TO PLACE THEM>>

## API
Async job pattern: submit an image, receive a job ID, poll or stream status,
then fetch result URLs.

| Endpoint | Method | Description |
|---|---|---|
| `/api/reconstruct` | POST | Submit image, returns job ID |
| <<STATUS ENDPOINT>> | GET | <<DESCRIPTION>> |
| <<RESULT ENDPOINT>> | GET | <<DESCRIPTION>> |

Full schemas: `frontend/docs/BACKEND_CONTRACT.md`.

## Evaluation
```bash
python eval/run_benchmark.py        # <<ADD ONCE WRITTEN>>
```
Experiments are in `notebooks/01_depth_backbone_eval.ipynb` and
`notebooks/02_calibration_experiments.ipynb`.

### Results
30 DFC2019 tiles, 256 sparse reference points, 5 seeds:

| Method | RMSE (m) | MAE (m) |
|---|---|---|
| Single global fit | 3.70 | 2.51 |
| **Per-class least squares (ours)** | **2.94** | **1.63** |
| Oracle per-class ceiling | 2.93 | n/a |

Per-class calibration beat the global fit on all 30 tiles.
<<ADD BENCHMARK TABLE BY TERRAIN TYPE: urban / sparse / hilly / forested>>

<<OUTPUT SCREENSHOT: input vs predicted DSM>>
<<OUTPUT SCREENSHOT: confidence map>>
<<OUTPUT SCREENSHOT: 3D terrain viewer>>
<<OUTPUT SCREENSHOT: validation panel>>

## Tests
```bash
cd backend && pytest
cd frontend && npm test             # <<VERIFY>>
```

## Limitations
- Most remaining error is in vegetation and building classes
- A linear per-class fit is saturated; further gains need a stronger depth backbone
- <<ANYTHING ELSE>>

## Team
| Name | Role | GitHub |
|---|---|---|
| Tanmay Jain | Backend, ML/DL (inference, calibration, confidence, API), Literature survey, evaluation scripts, Dataset preparation, preprocessing,  | [@TanmayJain09](https://github.com/TanmayJain09) |
| Ashutosh Gopale | Frontend, 3D visualization, API Integration | [@Fellarity](https://github.com/Fellarity)|
| Mahak Choudhary | Documentation, Backend Review | [@mahakkchoudhary](https://github.com/mahakkchoudhary)|
| Rishabh Gaud | Integration testing | [@rishabhchamp007-cloud](https://github.com/rishabhchamp007-cloud) |

## Acknowledgements
- Depth Anything V2
- DFC2019 (IEEE GRSS Data Fusion Contest)
- TR2M –  Language Conditioned Rescalling
- ScaleDepth
- SSRDepth

## License
[MIT License](./LICENCE)