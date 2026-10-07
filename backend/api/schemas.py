from typing import Dict, List, Literal, Optional
from pydantic import BaseModel


class JobCreated(BaseModel):
    job_id: str
    status_url: str


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "done", "failed"]
    error: Optional[str] = None
    metadata_url: Optional[str] = None


class ClassStats(BaseModel):
    rmse: float
    n_ref: int
    scale: float
    shift: float


class Metadata(BaseModel):
    job_id: str
    mode: Literal["georeferenced", "relative"]
    units: Literal["metres", "normalized"]
    width: int
    height: int
    height_min: float          # value of heightmap pixel 0     (metres or 0 if relative)
    height_max: float          # value of heightmap pixel 65535 (metres or 1 if relative)
    heightmap_encoding: str    # how to decode the PNG
    pixel_size_m: Optional[float] = None
    mean_confidence: float
    classes: Dict[str, ClassStats]
    files: Dict[str, str]      # name -> absolute path under the API
