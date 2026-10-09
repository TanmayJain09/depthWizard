// @vitest-environment jsdom
import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { TerrainViewer } from "../src/components/TerrainViewer";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { useAppStore } from "../src/store";

// Mock R3F and drei to avoid WebGL context issues
vi.mock("@react-three/fiber", async () => {
  const actual = await vi.importActual("@react-three/fiber") as any;
  return {
    ...actual,
    Canvas: ({ children, onClick }: any) => (
      <div data-testid="mock-canvas" onClick={onClick}>
        {children}
      </div>
    ),
    useThree: () => ({
      camera: { 
        position: { x: 0, y: 0, z: 0, set: vi.fn(), lerp: vi.fn(), distanceTo: vi.fn(), addScaledVector: vi.fn() },
        lookAt: vi.fn(),
        rotation: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        getWorldDirection: vi.fn((v) => { v.set(0, 0, -1); return v; }),
        fov: 75
      },
      scene: { 
        children: [{ name: "terrainMesh" }],
        traverse: vi.fn()
      },
      gl: {
        domElement: { 
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        },
        render: vi.fn()
      }
    }),
    useFrame: (cb: any) => {
      // Execute the callback once to simulate a frame
      useEffect(() => {
        cb({}, 0.016);
      }, []);
    }
  };
});

vi.mock("@react-three/drei", async () => {
  return {
    PointerLockControls: (_onUnlock: any) => <div data-testid="pointer-lock-controls" />,
    MapControls: () => <div data-testid="map-controls" />
  };
});

// We must mock THREE.Raycaster to prevent errors when doing intersectObjects
vi.mock("three", async () => {
  const actual = await vi.importActual("three") as any;
  return {
    ...actual,
    Raycaster: class {
      setFromCamera = vi.fn();
      intersectObjects = vi.fn(() => [{
        object: { name: "terrainMesh" },
        uv: { x: 0.5, y: 0.5 },
        point: new actual.Vector3(0, 0, 0)
      }]);
    }
  };
});

describe("TerrainViewer Render and Hover Stability", () => {
  beforeEach(() => {
    // Setup initial store state
    useAppStore.setState({
      jobId: "test-job",
      jobStatus: "complete",
      result: {
        meta: { job_id: "test-job", original_filename: "test", width: 10, height: 10, units: "metres", status: "complete", started_at: "", completed_at: "", execution_time_sec: 1, method: "heuristic" },
        heightmapUrl: "mock-url"
      },
      cameraMode: "orbit",
      activeTool: "navigate"
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not crash or re-render during rapid pointer moves and mode switches", () => {
    let renderCount = 0;
    
    const RenderCounter = () => {
      renderCount++;
      return <TerrainViewer />;
    };

    const { container } = render(
      <ErrorBoundary>
        <RenderCounter />
      </ErrorBoundary>
    );

    const initialRenderCount = renderCount;
    const canvasContainer = container.querySelector('.viewer-container');
    if (!canvasContainer) console.log('INNER HTML', container.innerHTML);
    expect(canvasContainer).toBeTruthy();

    // 1. Simulate pointer enter and rapid moves in Orbit mode
    act(() => {
      fireEvent.pointerEnter(canvasContainer!);
      for (let i = 0; i < 100; i++) {
        fireEvent.mouseMove(window, { clientX: 100 + i, clientY: 100 + i });
      }
    });

    // 2. Switch to Fly mode
    act(() => {
      useAppStore.getState().setCameraMode("fly");
    });

    // 3. Simulate pointer moves in Fly mode
    act(() => {
      for (let i = 0; i < 100; i++) {
        fireEvent.mouseMove(window, { clientX: 200 + i, clientY: 200 + i });
      }
    });
    
    // 4. Simulate a pointerlockerror event (should fallback to orbit)
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    act(() => {
      const errEvent = new Event("pointerlockerror");
      document.dispatchEvent(errEvent);
    });

    expect(useAppStore.getState().cameraMode).toBe("orbit");

    // 5. Final check of render counts
    // initial render + setCameraMode("fly") + setCameraMode("orbit") = exactly 3 renders.
    expect(renderCount).toBeLessThanOrEqual(initialRenderCount + 2);
    
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining("Maximum update depth exceeded"));
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining("TypeError"));
  });
});
