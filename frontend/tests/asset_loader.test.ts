import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadJobAssets, terrainCache, textureCache } from "../src/core/asset_loader";

// Mock fast-png
vi.mock("fast-png", () => ({
  decode: vi.fn(() => ({
    data: new Uint16Array(4) // 2x2
  }))
}));

// Mock THREE
vi.mock("three", () => {
  class TextureLoader {
    load(url: string, onLoad: (tex: any) => void) {
      setTimeout(() => onLoad({ colorSpace: "", anisotropy: 1, needsUpdate: false }), 0);
    }
  }
  return {
    TextureLoader,
    SRGBColorSpace: "srgb",
  };
});

describe("asset_loader", () => {
  beforeEach(() => {
    terrainCache.clear();
    textureCache.clear();
    global.fetch = vi.fn(async () => {
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8)
      } as Response;
    });
  });

  it("loads assets exactly once and caches them", async () => {
    const meta = { width: 2, height: 2, height_min: 0, height_max: 10, units: "metres" };
    
    // First load
    const result1 = await loadJobAssets("job_123", "http://test/heightmap.png", "http://test/texture.jpg", meta);
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("http://test/heightmap.png");
    
    expect(terrainCache.has("job_123")).toBe(true);
    expect(textureCache.has("job_123")).toBe(true);
    
    expect(result1.mesh.positions).toBeDefined();
    expect(result1.texture).toBeDefined();

    // Second load
    const result2 = await loadJobAssets("job_123", "http://test/heightmap.png", "http://test/texture.jpg", meta);
    
    // Fetch count should STILL be exactly 1
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    // Results should be identical references
    expect(result2.mesh).toBe(result1.mesh);
    expect(result2.texture).toBe(result1.texture);
  });
});
