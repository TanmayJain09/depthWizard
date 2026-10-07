export interface MeshBuildParams {
  width: number;
  height: number;
  data: Float32Array;
  exaggeration: number;
}

export interface MeshBuildResult {
  positions: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array;
}

self.onmessage = (e: MessageEvent<MeshBuildParams>) => {
  const { width, height, data, exaggeration } = e.data;

  // We build a plane geometry where Z is up
  const segmentsX = width - 1;
  const segmentsY = height - 1;
  
  const vertices = new Float32Array(width * height * 3);
  const uvs = new Float32Array(width * height * 2);
  const indices = new Uint32Array(segmentsX * segmentsY * 6);

  let v = 0;
  let uvIdx = 0;
  let iIdx = 0;

  // Center the mesh around 0,0
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x - halfWidth;
      const py = halfHeight - y;
      
      const idx = y * width + x;
      const pz = data[idx] * exaggeration;

      vertices[v++] = px;
      vertices[v++] = py;
      vertices[v++] = pz;

      uvs[uvIdx++] = x / segmentsX;
      uvs[uvIdx++] = 1.0 - (y / segmentsY);

      if (x < segmentsX && y < segmentsY) {
        const a = x + segmentsX + 1;
        const b = x + segmentsX + 2;
        const c = x;
        const d = x + 1;

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
    uvs
  };

  self.postMessage(result, [vertices.buffer, indices.buffer, uvs.buffer]);
};
