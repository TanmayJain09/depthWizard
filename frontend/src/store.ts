import { create } from "zustand";
import { api } from "./api";
import type { JobResult } from "./api";
import { createDummyLabelsFile } from "./core/dummy";

export interface AppSettings {
  apiBaseUrl: string;
  defaultNodata: number | undefined;
  defaultConfThreshold: number;
  units: "metric" | "imperial";
}

export interface Bookmark {
  id: string;
  name: string;
  cameraState: {
    position: [number, number, number];
    target: [number, number, number];
    mode: "orbit" | "fly";
    fov?: number;
    rotation?: [number, number, number]; // for fly mode orientation
  };
}

export interface ValidationRun {
  id: string;
  tag: string;
  rmse: number;
  mae: number;
  overlapPercent: number;
  validPixels: number;
  nodata: number | undefined;
}

export interface RegionMetric {
  id: string;
  tag: string;
  rmse: number;
  mae: number;
  validPixels: number;
}

export interface AppState {
  settings: AppSettings;
  setSettings: (partial: Partial<AppSettings>) => void;

  bookmarks: Bookmark[];
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
  activeBookmarkId: string | null;
  setActiveBookmarkId: (id: string | null) => void;

  isTouring: boolean;
  tourSpeed: number;
  setIsTouring: (touring: boolean) => void;
  setTourSpeed: (speed: number) => void;

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
  activeTool: "navigate" | "measure" | "slope" | "profile" | "validate" | "export";
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
  validationStatus: "idle" | "running" | "error" | "done";
  validationError: string | null;
  validationMetrics: any | null; // from ValidationResult
  validationNodata: number | undefined;
  showErrorMap: boolean;
  showReference: boolean;
  validationHistory: ValidationRun[];
  regionMetrics: RegionMetric[];
  confThreshold: number;
  
  // Actions
  setValidationRefFile: (file: File | null) => void;
  setValidationNodata: (val: number | undefined) => void;
  setConfThreshold: (val: number) => void;
  setShowErrorMap: (val: boolean) => void;
  setShowReference: (val: boolean) => void;
  runValidation: (predData: Float32Array) => Promise<void>;
  updateValidationRunTag: (id: string, tag: string) => void;
  clearValidationHistory: () => void;
  computeRegionMetrics: (mask: Uint8Array, tag: string) => void;
  cancelValidation: () => void;
  reset: () => void;
}

// Keep a reference to the active worker so we can cancel it
let activeValidationWorker: Worker | null = null;

const defaultSettings: AppSettings = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
  defaultNodata: -9999,
  defaultConfThreshold: 0.8,
  units: "metric"
};

const getSavedSettings = (): AppSettings => {
  const saved = localStorage.getItem("depthwizard_settings");
  if (saved) {
    try { return { ...defaultSettings, ...JSON.parse(saved) }; } catch (e) {}
  }
  return defaultSettings;
};

const getSavedBookmarks = (): Bookmark[] => {
  const saved = localStorage.getItem("depthwizard_bookmarks");
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return [];
};

export const useAppStore = create<AppState>((set, get) => ({
  settings: getSavedSettings(),
  setSettings: (partial) => set((s) => {
    const next = { ...s.settings, ...partial };
    localStorage.setItem("depthwizard_settings", JSON.stringify(next));
    return { settings: next };
  }),

  bookmarks: getSavedBookmarks(),
  addBookmark: (b) => set(s => {
    const next = [...s.bookmarks, b];
    localStorage.setItem("depthwizard_bookmarks", JSON.stringify(next));
    return { bookmarks: next };
  }),
  removeBookmark: (id) => set(s => {
    const next = s.bookmarks.filter(b => b.id !== id);
    localStorage.setItem("depthwizard_bookmarks", JSON.stringify(next));
    return { bookmarks: next };
  }),
  renameBookmark: (id, name) => set(s => {
    const next = s.bookmarks.map(b => b.id === id ? { ...b, name } : b);
    localStorage.setItem("depthwizard_bookmarks", JSON.stringify(next));
    return { bookmarks: next };
  }),
  activeBookmarkId: null,
  setActiveBookmarkId: (id) => set({ activeBookmarkId: id }),

  isTouring: false,
  tourSpeed: 0.5,
  setIsTouring: (touring) => set({ isTouring: touring }),
  setTourSpeed: (speed) => set({ tourSpeed: speed }),

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
  showReference: false,
  validationHistory: [],
  regionMetrics: [],
  confThreshold: 0.8,

  setFile: (file) => set({ selectedFile: file }),
  setLabelsFile: (file) => set({ labelsFile: file }),
  setReferenceFile: (file) => set({ referenceFile: file }),
  setCalibrateMode: (mode) => set({ calibrateMode: mode }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setExaggeration: (val) => set({ exaggeration: val }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setValidationRefFile: (file) => set({ validationRefFile: file, validationMetrics: null, validationError: null, validationStatus: "idle", regionMetrics: [] }),
  setValidationNodata: (val) => set({ validationNodata: val }),
  setConfThreshold: (val) => set({ confThreshold: val }),
  setShowErrorMap: (val) => set({ showErrorMap: val }),
  setShowReference: (val) => set({ showReference: val }),
  updateValidationRunTag: (id, tag) => set((s) => ({
    validationHistory: s.validationHistory.map(r => r.id === id ? { ...r, tag } : r)
  })),
  clearValidationHistory: () => set({ validationHistory: [] }),
  
  computeRegionMetrics: (mask: Uint8Array, tag: string) => {
    const { validationMetrics } = get();
    if (!validationMetrics || !validationMetrics.errorMap) return;
    
    // We can do this synchronously here since it's just a subset loop
    const errorMap = validationMetrics.errorMap;
    let sumSq = 0;
    let sumAbs = 0;
    let count = 0;
    
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 0 && !Number.isNaN(errorMap[i])) {
        const e = errorMap[i];
        sumSq += e * e;
        sumAbs += Math.abs(e);
        count++;
      }
    }
    
    if (count > 0) {
      const metric: RegionMetric = {
        id: Date.now().toString(),
        tag,
        rmse: Math.sqrt(sumSq / count),
        mae: sumAbs / count,
        validPixels: count
      };
      set(s => ({ regionMetrics: [...s.regionMetrics, metric] }));
    }
  },
  
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
    const { validationRefFile, result, validationNodata, confThreshold, validationHistory } = get();
    if (!validationRefFile || !result?.meta) return;

    set({ validationStatus: "running", validationError: null, validationMetrics: null });

    if (activeValidationWorker) {
      activeValidationWorker.terminate();
    }

    try {
      const refBuffer = await validationRefFile.arrayBuffer();
      
      let confData: Uint8Array | null = null;
      if (result.meta.files?.confidence) {
        const cRes = await fetch(result.meta.files.confidence);
        if (cRes.ok) {
          const ab = await cRes.arrayBuffer();
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
          const res = e.data.result;
          
          const newRun: ValidationRun = {
            id: Date.now().toString(),
            tag: `Run ${validationHistory.length + 1}`,
            rmse: res.all.rmse,
            mae: res.all.mae,
            overlapPercent: res.overlapPercent,
            validPixels: res.all.validPixels,
            nodata: validationNodata
          };

          set((s) => ({ 
            validationStatus: "done", 
            validationMetrics: res,
            validationHistory: [...s.validationHistory, newRun]
          }));
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
        predNodata: undefined,
        confData,
        nodataOverride: validationNodata,
        confThreshold,
        minHeight: result.meta.height_min,
        maxHeight: result.meta.height_max
      });
      
    } catch (err: any) {
      set({ validationStatus: "error", validationError: err.message });
      activeValidationWorker = null;
    }
  }
}));
