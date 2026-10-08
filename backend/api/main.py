import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(title="depthWizard API")

cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware, 
    allow_origins=cors_origins, 
    allow_methods=["*"], 
    allow_headers=["*"]
)
app.include_router(router)


@app.get("/health")
def health():
    # To check if depth model is loaded, we can look at depth_inference
    # and for segmentation we can look at segmentation backend
    from pipeline.depth_inference import _depth_model
    from pipeline.segmentation import active_backend
    
    return {
        "ok": True,
        "depth_model_loaded": _depth_model is not None,
        "segmentation_backend": active_backend()
    }
