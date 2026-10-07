// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealApiClient } from '../src/api/real';

describe('API Transport Abstraction', () => {
  let originalElectron: any;

  beforeEach(() => {
    originalElectron = (window as any).electron;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    (window as any).electron = originalElectron;
    vi.restoreAllMocks();
  });

  it('uses browser fetch when electron is not present', async () => {
    (window as any).electron = undefined;
    const api = new RealApiClient("http://localhost:8000");
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    });

    await api.ping();
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:8000/openapi.json", { method: "GET" });
  });

  it('uses electron IPC when electron is present', async () => {
    const mockPing = vi.fn().mockResolvedValue({ ok: true });
    (window as any).electron = {
      api: { ping: mockPing }
    };

    const api = new RealApiClient("http://localhost:8000");
    await api.ping();

    expect(mockPing).toHaveBeenCalledWith("http://localhost:8000");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
