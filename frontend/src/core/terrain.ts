import { fromUrl } from "geotiff";

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

import { decode } from "fast-png";

export async function parsePngUrl(url: string, metaMinHeight: number, metaMaxHeight: number): Promise<TerrainGrid> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch heightmap: ${res.statusText}`);
  
  const buffer = await res.arrayBuffer();
  const png = decode(buffer);
  
  const width = png.width;
  const height = png.height;
  
  // fast-png decodes 16-bit grayscale PNG to Uint16Array.
  // We reconstruct the absolute heights using the formula from backend metadata.
  const data = new Float32Array(width * height);
  const rawData = png.data;
  
  const span = metaMaxHeight - metaMinHeight;
  
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const px = rawData[i];
    const h = metaMinHeight + (px / 65535.0) * span;
    data[i] = h;
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
  }

  return { width, height, data, minHeight, maxHeight };
}
