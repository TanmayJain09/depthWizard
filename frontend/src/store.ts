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
  reset: () => void;
}

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

  setFile: (file) => set({ selectedFile: file }),
  setLabelsFile: (file) => set({ labelsFile: file }),
  setReferenceFile: (file) => set({ referenceFile: file }),
  setCalibrateMode: (mode) => set({ calibrateMode: mode }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setExaggeration: (val) => set({ exaggeration: val }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
  reset: () => set({ 
    selectedFile: null, 
    labelsFile: null,
    referenceFile: null, 
    jobId: null, 
    jobStatus: "idle",
    result: null,
    jobProgress: 0,
    jobError: null,
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
  }
}));
