import * as THREE from "three";
import { decode } from "fast-png";
import type { MeshBuildResult } from "./terrain.worker";

export const terrainCache = new Map<string, MeshBuildResult>();
export const textureCache = new Map<string, THREE.Texture>();

export async function loadJobAssets(
  jobId: string, 
  heightmapUrl: string, 
  textureUrl: string | null, 
  meta: any
): Promise<{ mesh: MeshBuildResult, texture: THREE.Texture | null }> {
  let meshResult = terrainCache.get(jobId);
  if (!meshResult) {
    const res = await fetch(heightmapUrl);
    if (!res.ok) throw new Error("Failed to fetch heightmap");
    const buffer = await res.arrayBuffer();
    const png = decode(buffer);
    const rawData = png.data as Uint16Array;
    
    const width = meta.width;
    const height = meta.height;
    const minHeight = meta.height_min;
    const maxHeight = meta.height_max;
    
    // Using units to determine real geometry scaling
    const isNormalized = meta.units === "normalized";
    // For normalized, pixels are the unit. For metric, we use pixel_size_m if available.
    const pixelSize = meta.pixel_size_m || 1.0;
    const pxScale = isNormalized ? 1.0 : pixelSize;
    
    // Scale Z accurately: for normalized we just store raw 0..1 * maxDimension?
    // Wait, the worker originally stored `h = minHeight + (rawPx/65535)*span`.
    let span = maxHeight - minHeight;
    let baseMinHeight = minHeight;
    
    // For normalized units, scale the height by 0.12 * max(width, height)
    if (isNormalized) {
        const maxDim = Math.max(width, height);
        span = 0.12 * maxDim;
        baseMinHeight = 0; 
    }
    const segmentsX = width - 1;
    const segmentsY = height - 1;
    
    const vertices = new Float32Array(width * height * 3);
    const uvs = new Float32Array(width * height * 2);
    const indices = new Uint32Array(segmentsX * segmentsY * 6);
    const data = new Float32Array(width * height);

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    let v = 0;
    let uvIdx = 0;
    let iIdx = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const px = (x - halfWidth) * pxScale;
        const py = (halfHeight - y) * pxScale;
        
        const h = baseMinHeight + (rawData[idx] / 65535.0) * span;
        data[idx] = h;
        
        // We do NOT apply exaggeration here. It will be applied dynamically.
        vertices[v++] = px;
        vertices[v++] = py;
        vertices[v++] = h; 

        uvs[uvIdx++] = x / segmentsX;
        uvs[uvIdx++] = 1.0 - (y / segmentsY);

        if (x < segmentsX && y < segmentsY) {
          const row1 = y * width;
          const row2 = (y + 1) * width;

          const pA = row1 + x;
          const pB = row1 + x + 1;
          const pC = row2 + x;
          const pD = row2 + x + 1;

          // CCW winding: bottom-left, bottom-right, top-right
          indices[iIdx++] = pA;
          indices[iIdx++] = pC;
          indices[iIdx++] = pB;

          indices[iIdx++] = pB;
          indices[iIdx++] = pC;
          indices[iIdx++] = pD;
        }
      }
    }
    
    meshResult = { positions: vertices, indices, uvs, data };
    terrainCache.set(jobId, meshResult);
  }

  let tex = textureUrl ? textureCache.get(jobId) : null;
  if (textureUrl && !tex) {
    tex = await new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        textureUrl,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 16;
          t.needsUpdate = true;
          resolve(t);
        },
        undefined,
        (err) => reject(err)
      );
    });
    if (tex) textureCache.set(jobId, tex);
  }

  return { mesh: meshResult, texture: tex || null };
}
