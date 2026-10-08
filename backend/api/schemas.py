from typing import Dict, List, Literal, Optional
from pydantic import BaseModel


class JobCreated(BaseModel):
    job_id: str
    status_url: str


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "done", "failed"]
    stage: Optional[str] = None
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
    is_georeferenced: bool
    crs: Optional[str] = None
    bounds_wgs84: Optional[List[float]] = None
    srtm_error: Optional[str] = None
    
    transform: Optional[List[float]] = None
    height_datum: Optional[str] = None
    segmentation_source: Optional[str] = None
    segmentation_warning: Optional[str] = None
    approx_height_range_m: Optional[List[float]] = None
    exif_transposed: Optional[bool] = None

    class Config:
        json_encoders = {
            float: lambda v: None if v != v or v == float('inf') or v == float('-inf') else v
        }
