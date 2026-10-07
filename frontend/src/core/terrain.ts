import { fromUrl, fromBlob, fromArrayBuffer } from "geotiff";

export interface TerrainGrid {
  width: number;
  height: number;
  data: Float32Array;
  minHeight: number;
  maxHeight: number;
}

export async function parseGeoTiffUrl(url: string): Promise<TerrainGrid> {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  
  const rasters = await image.readRasters();
  let data: Float32Array;
  
  // Convert to Float32Array
  if (rasters[0] instanceof Float32Array) {
    data = rasters[0];
  } else {
    const raw = rasters[0] as any;
    data = new Float32Array(width * height);
    for (let i = 0; i < raw.length; i++) {
      data[i] = raw[i];
    }
  }

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < minHeight) minHeight = v;
    if (v > maxHeight) maxHeight = v;
  }

  return { width, height, data, minHeight, maxHeight };
}

export async function parsePngUrl(url: string): Promise<TerrainGrid> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Failed to get 2d context"));
      
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      
      const data = new Float32Array(width * height);
      let minHeight = Infinity;
      let maxHeight = -Infinity;

      for (let i = 0; i < data.length; i++) {
        // Red channel used for relative depth in mock PNG
        const v = imgData.data[i * 4] / 255.0; 
        data[i] = v;
        if (v < minHeight) minHeight = v;
        if (v > maxHeight) maxHeight = v;
      }

      resolve({ width, height, data, minHeight, maxHeight });
    };
    img.onerror = reject;
    img.src = url;
  });
}
