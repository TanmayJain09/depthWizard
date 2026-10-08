# depthWizard Backend

FastAPI backend for depthWizard.

## Setup
1. Create a virtual environment and install requirements:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and configure it.

## Run
Run the backend with uvicorn:
```bash
cd backend
uvicorn api.main:app --port 8000
```

> **Note:** On first run, the pipeline will download large model weights (depth and segmentation models) if they are not already cached. This can take several minutes.
