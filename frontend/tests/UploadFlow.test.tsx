// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { UploadFlow } from "../src/components/UploadFlow";
import { useAppStore } from "../src/store";

// We need to mock Zustand store for different states.
vi.mock("../src/store", () => {
  let mockState: any = {};
  return {
    useAppStore: Object.assign(
      (selector?: (state: any) => any) => {
        return selector ? selector(mockState) : mockState;
      },
      {
        getState: () => mockState,
        setState: (state: any) => Object.assign(mockState, state),
      }
    ),
  };
});

vi.mock("../src/api", () => ({
  api: {
    getOpenApi: vi.fn(async () => ({ paths: {} }))
  },
  isMockMode: true
}));

describe("UploadFlow component", () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedFile: null,
      calibrateMode: "none",
      jobStatus: "idle",
      jobProgress: 0,
      jobStage: "",
      jobError: null,
      useBlankMask: false,
      setFile: vi.fn(),
      setReferenceFile: vi.fn(),
      setCalibrateMode: vi.fn(),
      startJob: vi.fn(),
      reset: vi.fn(),
      setUseBlankMask: vi.fn(),
    });
  });

  it("renders correctly without throwing across all states", () => {
    // 1. No file selected
    const { rerender } = render(<UploadFlow />);
    expect(screen.getByText(/Drop a PNG, JPG or GeoTIFF/i)).toBeTruthy();

    // 2. File selected
    useAppStore.setState({
      selectedFile: new File(["dummy content"], "test.png", { type: "image/png" }),
    });
    rerender(<UploadFlow />);
    expect(screen.getByText("test.png")).toBeTruthy();
    expect(screen.getByText(/Process Image/i)).toBeTruthy();

    // 3. Processing
    useAppStore.setState({
      jobStatus: "processing",
      jobStage: "Extracting features",
      jobProgress: 50,
    });
    rerender(<UploadFlow />);
    expect(screen.getByText("Extracting features")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();

    // 4. Error
    useAppStore.setState({
      jobStatus: "failed",
      jobError: "Out of memory",
    });
    rerender(<UploadFlow />);
    expect(screen.getByText("Out of memory")).toBeTruthy();
    expect(screen.getByText(/Try Again/i)).toBeTruthy();

    // 5. Back to idle
    useAppStore.setState({
      jobStatus: "idle",
      selectedFile: null,
      jobError: null,
    });
    rerender(<UploadFlow />);
    expect(screen.getByText(/Drop a PNG, JPG or GeoTIFF/i)).toBeTruthy();
  });
});
