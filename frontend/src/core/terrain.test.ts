import { describe, it, expect } from "vitest";
import { encode, decode } from "fast-png";

// Import the same logic used in the worker. We can extract it or duplicate it just for testing the math loop.
// To keep it simple and isolated, we will implement the same decoding and math loop here.

describe("Terrain Height Decoding", () => {
  it("should decode a 16-bit PNG and produce finite float heights", () => {
    // 1. Create a synthetic 16-bit PNG buffer
    const width = 256;
    const height = 256;
    const rawData = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const h = (Math.sin(x / 20) + Math.cos(y / 20) + 2) / 4; 
        rawData[y * width + x] = Math.floor(h * 65535);
      }
    }
    const pngBuffer = encode({ width, height, data: rawData, depth: 16, channels: 1 });
    
    // 2. Decode using fast-png
    const png = decode(pngBuffer);
    
    expect(png.depth).toBe(16);
    expect(png.channels).toBe(1);
    expect(png.data.length).toBe(width * height);
    
    // 3. Simulate the math loop from terrain.worker.ts
    const minHeight = 10;
    const maxHeight = 50;
    const span = maxHeight - minHeight;
    const exaggeration = 1.0;
    
    const data = new Float32Array(width * height);
    const vertices = new Float32Array(width * height * 3);
    
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    let v = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const px = x - halfWidth;
        const py = halfHeight - y;
        
        const rawPx = png.data[idx];
        const h = minHeight + (rawPx / 65535.0) * span;
        data[idx] = h;
        const pz = h * exaggeration;
  
        vertices[v++] = px;
        vertices[v++] = py;
        vertices[v++] = pz;
      }
    }
    
    // 4. Verify outputs
    let hasNaN = false;
    for (let i = 0; i < data.length; i++) {
      if (Number.isNaN(data[i])) {
        hasNaN = true;
        break;
      }
    }
    
    expect(hasNaN).toBe(false);
    expect(data[0]).toBeGreaterThanOrEqual(10);
    expect(data[0]).toBeLessThanOrEqual(50);
  });
});
