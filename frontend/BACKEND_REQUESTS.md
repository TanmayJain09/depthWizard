# Backend Requests

This document outlines questions and feature requests for the backend team from the frontend perspective.

## 1. Optional `labels` in `/api/v1/process`
Currently, the `/api/v1/process` endpoint strictly requires a `labels` file upload (`labels: UploadFile = File(...)`). The frontend currently generates a blank mask PNG automatically if the user doesn't provide one, just to satisfy this constraint.
- **Request:** Could `labels` be made optional in the backend (`Optional[UploadFile] = File(None)`)?
- **Question:** What encoding/class IDs does the mask expect? (e.g. 0 for ground, 1 for vegetation)? 
- **Question:** If a blank/dummy mask is provided by the frontend, does this negatively influence the scale calibration/accuracy of the model?

## 2. Nodata Values in 16-bit PNG
The new 16-bit `heightmap.png` outputs are decoded linearly by the frontend using `height_min` and `height_max`.
- **Question:** Is there a specific pixel value (e.g., `0` or `65535`) that represents "nodata" or invalid pixels, so the frontend can hide those vertices from the 3D mesh?

## 3. CORS Configuration
For local development, the frontend Vite server runs on `http://localhost:5173`. We currently proxy requests via Vite, but for the packaged Electron build, we hit the API directly.
- **Request:** Please ensure that CORS is enabled in the FastAPI backend, at least for local development loops and the packaged app environment.
## 4. Vertical Datum and DSM semantics
When performing client-side validation against a reference DSM, we need to know exactly what the predicted heights represent.
- **Question:** Is the output `calibrated_georeference` an absolute elevation (DSM) or a height above ground (nDSM)?
- **Question:** What is the specific vertical datum used (e.g., WGS84 ellipsoid, EGM96 geoid, local datum)? Does the API align the prediction to the reference DSM's datum if uploaded during inference?
