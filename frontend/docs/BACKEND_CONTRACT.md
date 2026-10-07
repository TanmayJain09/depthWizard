# Backend Contract

**Version:** 1.1.0
**Date:** 2026-10-07

## Framework & Entry Point
- **Framework**: FastAPI (with Uvicorn).
- **Run command**: `uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload`
- **Default Port**: `8000`.

## Endpoints

### 1. `POST /api/v1/process` [CONFIRMED]
- **Format**: `multipart/form-data`
- **Fields**:
  - `image` (Required): The RGB image file (PNG, JPG, or GeoTIFF).
  - `labels` (Required): Raster file with semantic classes for calibration.
  - `reference` (Optional): Sparse reference height raster (GeoTIFF) for georeferenced calibration.
  - `dfc_labels` (Optional boolean): `Form(False)`.
  - `robust` (Optional boolean): `Form(False)`.
  - `pixel_size_m` (Optional float): `Form(None)`.
- **Response Format**: `JobCreated` JSON containing `job_id` and `status_url` (`/api/v1/jobs/{jid}`).

### 2. `GET /api/v1/jobs/{jid}` [CONFIRMED]
- **Response Format**: `JobStatus` JSON containing `job_id`, `status` (`"queued"`, `"processing"`, `"done"`, `"failed"`), `error`, and `metadata_url`.

### 3. `GET /api/v1/jobs/{jid}/metadata` [CONFIRMED]
- **Response Format**: `Metadata` JSON containing:
  - `mode`: `"georeferenced"` or `"relative"`
  - `units`: `"metres"` or `"normalized"`
  - `height_min`, `height_max`: Min/Max heights
  - `heightmap_encoding`: String describing 16-bit PNG encoding
  - `files`: Dictionary mapping `"heightmap"`, `"confidence"`, and `"texture"` to their respective URLs (`/api/v1/jobs/{jid}/{name}`).

### 4. `GET /api/v1/jobs/{jid}/{name}` [CONFIRMED]
- Supports `heightmap.png`, `confidence.png`, and `texture.jpg`.

## Outputs & Formats [CONFIRMED]
The backend outputs standard image files instead of GeoTIFFs for web rendering efficiency:
1. **Heightmap**: `heightmap.png` (16-bit Grayscale PNG). Heights can be reconstructed using: `h = height_min + (px/65535) * (height_max - height_min)`.
2. **Confidence Map**: `confidence.png` (8-bit Grayscale PNG).
3. **Texture**: `texture.jpg` (RGB texture).

## Georeferenced vs Non-Georeferenced Input
- **Detection**: Handled by the backend `input_handler.py`.
- **Calibration**: 
  - `calibrate_georeferenced`: Uses sparse reference points (e.g., LiDAR or SRTM) to perform least-squares fit per class.
  - `calibrate_relative`: (Experimental) Uses predefined height priors.
