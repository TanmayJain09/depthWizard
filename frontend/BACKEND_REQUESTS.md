# Backend Requests

This file contains requests from the frontend team to the backend team for the "DepthWizard / AltiMap" system.

## 1. API Implementation Needed
The files in `backend/api/` (`main.py`, `routes.py`, `schemas.py`) are currently empty. Please implement the FastAPI application and expose the required endpoints.

### Expected Endpoints
- `POST /api/v1/predict`
  - Accepts `multipart/form-data` with fields: `image` (required), `labels` (optional), `reference` (optional), `calibrate` (optional: "georeferenced", "relative").
  - Should either return the inference synchronously or return a job ID if processing is async.
- `GET /api/v1/jobs/{job_id}` (if async)
  - Returns job status and output URLs when complete.

## 2. CORS Configuration
Please ensure that CORS is configured in `main.py` so that the frontend can interact with the API during development and production.
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Please restrict to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 3. Clear Output Formats
Please ensure the API returns clear links to the output files (GeoTIFF for absolute DSM, PNG/NPY for relative depth) along with the confidence maps and class summary metadata as a JSON response.
