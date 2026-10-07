import os
import numpy as np
import rasterio
from rasterio.transform import from_origin
from PIL import Image

def main():
    os.makedirs("public/mock", exist_ok=True)
    
    # 1. Create Absolute DSM GeoTIFF (e.g. 512x512)
    h, w = 512, 512
    # Procedural terrain: a hill in the center
    y, x = np.ogrid[-h//2:h//2, -w//2:w//2]
    dsm = np.exp(-(x**2 + y**2) / (2 * 100**2)) * 100.0  # Max height 100m
    dsm += np.random.normal(0, 1.0, (h, w)) # add some noise
    dsm = dsm.astype(np.float32)
    
    transform = from_origin(144.9631, -37.8136, 1.0, 1.0) # 1m resolution
    crs = "EPSG:32755"
    
    with rasterio.open(
        "public/mock/dsm_absolute.tif",
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype=dsm.dtype,
        crs=crs,
        transform=transform
    ) as dst:
        dst.write(dsm, 1)

    # 2. Create Relative DSM (PNG)
    # Normalize to 0-255 for PNG
    rdsm = ((dsm - dsm.min()) / (dsm.max() - dsm.min()) * 255).astype(np.uint8)
    Image.fromarray(rdsm).save("public/mock/dsm_relative.png")
    
    # 3. Create a noisy Reference DSM for validation testing
    ref_dsm = dsm + np.random.normal(0, 3.0, (h, w)) # 3m noise
    ref_dsm = ref_dsm.astype(np.float32)
    with rasterio.open(
        "public/mock/dsm_reference.tif",
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype=ref_dsm.dtype,
        crs=crs,
        transform=transform
    ) as dst:
        dst.write(ref_dsm, 1)
        
    # 4. Create confidence map (Float32 TIFF)
    conf = np.clip(1.0 - np.abs(np.random.normal(0, 0.2, (h, w))), 0, 1).astype(np.float32)
    with rasterio.open(
        "public/mock/confidence.tif",
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype=conf.dtype,
        crs=crs,
        transform=transform
    ) as dst:
        dst.write(conf, 1)
        
    print("Mock data generated in public/mock/")

if __name__ == "__main__":
    main()
