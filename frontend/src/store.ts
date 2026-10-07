import { create } from "zustand";
import { api } from "./api";
import type { JobResult } from "./api";
import { createDummyLabelsFile } from "./core/dummy";

interface AppState {
  // Input
  selectedFile: File | null;
  labelsFile: File | null;
  referenceFile: File | null;
  calibrateMode: "none" | "georeferenced" | "relative";
  
  // Job status
  jobId: string | null;
  jobStatus: JobResult["status"] | "idle";
  jobProgress: number;
  jobStage: string;
  jobError: string | null;
  result: JobResult["result"] | null;
  
  // Viewer state
  activeTool: "navigate" | "measure" | "slope" | "profile" | "validate";
  exaggeration: number;
  cameraMode: "orbit" | "fly";

  // Actions
  setFile: (file: File) => void;
  setLabelsFile: (file: File | null) => void;
  setReferenceFile: (file: File | null) => void;
  setCalibrateMode: (mode: "none" | "georeferenced" | "relative") => void;
  setActiveTool: (tool: AppState["activeTool"]) => void;
  setExaggeration: (val: number) => void;
  setCameraMode: (mode: AppState["cameraMode"]) => void;
  startJob: () => Promise<void>;
  // Validation
  validationRefFile: File | null;
  validationStatus: "idle" | "running" | "error";
  validationError: string | null;
  validationMetrics: any | null; // from ValidationResult
  validationNodata: number | undefined;
  showErrorMap: boolean;
  
  // Actions
  setValidationRefFile: (file: File | null) => void;
  setValidationNodata: (val: number | undefined) => void;
  setShowErrorMap: (val: boolean) => void;
  runValidation: (predData: Float32Array) => Promise<void>;
  cancelValidation: () => void;
}

// Keep a reference to the active worker so we can cancel it
let activeValidationWorker: Worker | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  selectedFile: null,
  labelsFile: null,
  referenceFile: null,
  calibrateMode: "none",
  
  jobId: null,
  jobStatus: "idle",
  jobProgress: 0,
  jobStage: "",
  jobError: null,
  result: null,

  activeTool: "navigate",
  exaggeration: 1.0,
  cameraMode: "orbit",

  validationRefFile: null,
  validationStatus: "idle",
  validationError: null,
  validationMetrics: null,
  validationNodata: undefined,
  showErrorMap: false,

  setFile: (file) => set({ selectedFile: file }),
  setLabelsFile: (file) => set({ labelsFile: file }),
  setReferenceFile: (file) => set({ referenceFile: file }),
  setCalibrateMode: (mode) => set({ calibrateMode: mode }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setExaggeration: (val) => set({ exaggeration: val }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setValidationRefFile: (file) => set({ validationRefFile: file, validationMetrics: null, validationError: null, validationStatus: "idle" }),
  setValidationNodata: (val) => set({ validationNodata: val }),
  setShowErrorMap: (val) => set({ showErrorMap: val }),
  
  cancelValidation: () => {
    if (activeValidationWorker) {
      activeValidationWorker.terminate();
      activeValidationWorker = null;
    }
    set({ validationStatus: "idle", validationError: "Validation cancelled." });
  },

  reset: () => set({ 
    selectedFile: null, 
    labelsFile: null,
    referenceFile: null, 
    jobId: null, 
    jobStatus: "idle",
    result: null,
    jobProgress: 0,
    jobError: null,
    validationRefFile: null,
    validationMetrics: null,
    validationStatus: "idle"
  }),

  startJob: async () => {
    const { selectedFile, labelsFile, referenceFile, calibrateMode } = get();
    if (!selectedFile) return;

    try {
      set({ jobStatus: "queued", jobProgress: 0, jobStage: "Submitting..." });
      
      let finalLabels = labelsFile;
      if (!finalLabels) {
        set({ jobStage: "Generating default mask..." });
        finalLabels = await createDummyLabelsFile(selectedFile);
      }
      
      set({ jobStage: "Submitting..." });
      const res = await api.predict(selectedFile, finalLabels, referenceFile || undefined, calibrateMode !== "none" ? calibrateMode : undefined);
      
      set({ jobId: res.jobId, jobStatus: "processing" });
      
      // Start polling
      const poll = async () => {
        const statusRes = await api.getJobStatus(res.jobId);
        
        set({ 
          jobStatus: statusRes.status,
          jobProgress: statusRes.progress || 0,
          jobStage: statusRes.stage || "",
          jobError: statusRes.error || null,
        });

        if (statusRes.status === "done") {
          set({ result: statusRes.result });
        } else if (statusRes.status === "processing" || statusRes.status === "queued") {
          setTimeout(poll, 1000);
        }
      };

      poll();

    } catch (err: any) {
      set({ jobStatus: "failed", jobError: err.message });
    }
  },

  runValidation: async (predData: Float32Array) => {
    const { validationRefFile, result, validationNodata } = get();
    if (!validationRefFile || !result?.meta) return;

    set({ validationStatus: "running", validationError: null, validationMetrics: null });

    if (activeValidationWorker) {
      activeValidationWorker.terminate();
    }

    try {
      const refBuffer = await validationRefFile.arrayBuffer();
      
      // Fetch confidence if available for filtering
      let confData: Uint8Array | null = null;
      if (result.meta.files?.confidence) {
        const cRes = await fetch(result.meta.files.confidence);
        if (cRes.ok) {
          const ab = await cRes.arrayBuffer();
          // Assuming the confidence map was also decoded similarly or we just pass the raw buffer to the worker
          // Actually, passing raw png buffer requires worker to decode it. Let's just pass the png buffer and let worker decode it.
          // I will modify the worker to decode the confidence PNG if passed as ArrayBuffer.
          const { decode } = await import("fast-png");
          const cPng = decode(ab);
          confData = cPng.data as Uint8Array;
        }
      }

      const worker = new Worker(new URL("./core/validation.worker.ts", import.meta.url), { type: "module" });
      activeValidationWorker = worker;

      worker.onmessage = (e) => {
        if (e.data.status === "error") {
          set({ validationStatus: "error", validationError: e.data.error });
        } else {
          set({ validationStatus: "idle", validationMetrics: e.data.result });
        }
        activeValidationWorker = null;
      };

      worker.postMessage({
        refBuffer,
        predData,
        predWidth: result.meta.width,
        predHeight: result.meta.height,
        predCrs: result.meta.crs || null,
        predTransform: result.meta.transform || null,
        predNodata: undefined, // FIXME: from meta if available
        confData,
        nodataOverride: validationNodata,
        confThreshold: 0.8 // could be configurable via state later
      });
      
    } catch (err: any) {
      set({ validationStatus: "error", validationError: err.message });
      activeValidationWorker = null;
    }
  }
}));
