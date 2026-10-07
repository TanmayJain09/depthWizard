from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(title="depthWizard API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])  # restrict in prod
app.include_router(router)


@app.get("/health")
def health():
    return {"ok": True}
