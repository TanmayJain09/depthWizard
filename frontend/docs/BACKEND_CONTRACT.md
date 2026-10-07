# Backend Contract

**Version:** 1.0.0
**Date:** 2026-10-07

**Note on Current State**: The backend API implementation (`backend/api/*.py`) is currently completely empty (0 bytes). The following summary is based on the `requirements.txt` and the actual logic present in `backend/pipeline/`. All endpoint structures are assumptions that the frontend will need the backend to fulfill.

## Checklist for Backend Owner
- [ ] Confirm the FastAPI entry point and port (`8000`).
- [ ] Confirm CORS will be enabled for local development.
- [ ] Confirm the request payload format for `/api/v1/predict` (multipart/form-data vs JSON).
- [ ] Confirm if inference is synchronous or if async job polling (`/api/v1/jobs/{job_id}`) is required.
- [ ] Confirm the exact JSON response schema (keys for metadata, links to result files).

## Framework & Entry Point
- **Framework**: FastAPI (with Uvicorn), based on `requirements.txt` and `input_handler.py`.
- **Run command ([ASSUMED])**: `uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload` (standard uvicorn invocation).
- **Default Port ([ASSUMED])**: `8000`.
- **CORS ([ASSUMED])**: Not yet configured. The backend will enable CORS for local development (e.g., `http://localhost:5173` for Vite).

## Endpoints ([ASSUMED])

Because the API routes do not exist yet, the following is the contract the frontend will assume. (Added to `BACKEND_REQUESTS.md` as well).

### 1. `POST /api/v1/predict` (or `/api/v1/process`)
- **Format ([ASSUMED])**: `multipart/form-data`
- **Fields ([ASSUMED])**:
  - `image`: The RGB image file (PNG, JPG, or GeoTIFF).
  - `labels` (optional): Raster file with semantic classes for calibration.
  - `reference` (optional): Sparse reference height raster (GeoTIFF) for georeferenced calibration.
  - `calibrate` (optional string): `"georeferenced"`, `"relative"`, or `"none"`.
- **Response Format ([ASSUMED])**: `application/json` (job/task ID) or directly a JSON containing metadata and links/paths to the result rasters.
  - If async, it returns a `job_id`. If sync, it returns metadata and URLs to download outputs. Given the time taken by deep learning models, async polling (`GET /api/v1/jobs/{job_id}`) is the safest assumption.

## Outputs & Formats
Based on the pipeline code, the backend produces:
1. **Relative Depth Map**: float32 array in [0, 1] (`depth_inference.py`).
2. **Absolute DSM**: float32 array in metres, after per-class scale/shift calibration (`calibration.py`).
3. **Uncertainty & Confidence Maps**: float32 arrays (sigma in metres, confidence in [0, 1]) (`confidence.py`).
4. **Output formats ([ASSUMED])**: GeoTIFF for georeferenced data and PNG/NPY for raw relative depth, depending on input.
5. **Class Summary**: JSON output containing per-class RMSE, scale, and shift (`class_summary` in `confidence.py`).

## Georeferenced vs Non-Georeferenced Input
- **Detection**: `input_handler.py` detects TIFFs (`_is_tiff`) and handles them via `rasterio`. Other formats (PNG/JPG) use `PIL`.
- **Calibration**: 
  - `calibrate_georeferenced`: Uses sparse reference points (e.g., LiDAR or SRTM) to perform least-squares fit per class.
  - `calibrate_relative`: (Experimental) Uses predefined height priors (e.g., Vegetation ~8m, Building ~12m) and boundary consistency, without reference data.

## Validation / Reference Data
- **Metrics**: The pipeline computes RMSE per class, and a 90% confidence interval coverage metric (`interval_coverage` in `confidence.py`).
- **Ground Truth**: Can be provided via the `reference` input. Sparse reference sampling is simulated via `sparse_reference` in `input_handler.py`.
