import { decode } from "fast-png";

export interface MeshBuildParams {
  heightmapUrl: string;
  minHeight: number;
  maxHeight: number;
  width: number;
  height: number;
  exaggeration: number;
}

export interface MeshBuildResult {
  positions: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array;
  data: Float32Array; // The raw un-exaggerated float heights, useful for the main thread hover
}

self.onmessage = async (e: MessageEvent<MeshBuildParams>) => {
  const { heightmapUrl, width, height, minHeight, maxHeight, exaggeration } = e.data;

  // Fetch the 16-bit PNG
  const res = await fetch(heightmapUrl);
  if (!res.ok) {
    console.error("Worker failed to fetch heightmap");
    return;
  }
  const buffer = await res.arrayBuffer();
  
  // Decode using fast-png
  const png = decode(buffer);
  const rawData = png.data; // Uint16Array
  
  const span = maxHeight - minHeight;
  
  // We build a plane geometry where Z is up
  const segmentsX = width - 1;
  const segmentsY = height - 1;
  
  const vertices = new Float32Array(width * height * 3);
  const uvs = new Float32Array(width * height * 2);
  const indices = new Uint32Array(segmentsX * segmentsY * 6);
  const data = new Float32Array(width * height);

  let v = 0;
  let uvIdx = 0;
  let iIdx = 0;

  // Center the mesh around 0,0
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const px = x - halfWidth;
      const py = halfHeight - y;
      
      const rawPx = rawData[idx];
      const h = minHeight + (rawPx / 65535.0) * span;
      data[idx] = h;
      const pz = h * exaggeration;

      vertices[v++] = px;
      vertices[v++] = py;
      vertices[v++] = pz;

      uvs[uvIdx++] = x / segmentsX;
      uvs[uvIdx++] = 1.0 - (y / segmentsY);

      if (x < segmentsX && y < segmentsY) {
        const row1 = y * width;
        const row2 = (y + 1) * width;

        const pA = row1 + x;
        const pB = row1 + x + 1;
        const pC = row2 + x;
        const pD = row2 + x + 1;

        indices[iIdx++] = pA;
        indices[iIdx++] = pC;
        indices[iIdx++] = pB;

        indices[iIdx++] = pB;
        indices[iIdx++] = pC;
        indices[iIdx++] = pD;
      }
    }
  }

  const result: MeshBuildResult = {
    positions: vertices,
    indices,
    uvs,
    data
  };

  self.postMessage(result, { transfer: [vertices.buffer, indices.buffer, uvs.buffer, data.buffer] });
};
