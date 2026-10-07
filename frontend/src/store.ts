import { create } from "zustand";
import { api, JobResult } from "../api";

interface AppState {
  // Input
  selectedFile: File | null;
  referenceFile: File | null;
  calibrateMode: "none" | "georeferenced" | "relative";
  
  // Job status
  jobId: string | null;
  jobStatus: JobResult["status"] | "idle";
  jobProgress: number;
  jobStage: string;
  jobError: string | null;
  result: JobResult["result"] | null;
  
  // Actions
  setFile: (file: File) => void;
  setReferenceFile: (file: File) => void;
  setCalibrateMode: (mode: "none" | "georeferenced" | "relative") => void;
  startJob: () => Promise<void>;
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  selectedFile: null,
  referenceFile: null,
  calibrateMode: "none",
  
  jobId: null,
  jobStatus: "idle",
  jobProgress: 0,
  jobStage: "",
  jobError: null,
  result: null,

  setFile: (file) => set({ selectedFile: file }),
  setReferenceFile: (file) => set({ referenceFile: file }),
  setCalibrateMode: (mode) => set({ calibrateMode: mode }),
  reset: () => set({ 
    selectedFile: null, 
    referenceFile: null, 
    jobId: null, 
    jobStatus: "idle",
    result: null,
    jobProgress: 0,
    jobStage: "",
    jobError: null,
  }),

  startJob: async () => {
    const { selectedFile, referenceFile, calibrateMode } = get();
    if (!selectedFile) return;

    try {
      set({ jobStatus: "pending", jobProgress: 0, jobStage: "Submitting..." });
      
      const res = await api.predict(selectedFile, undefined, referenceFile || undefined, calibrateMode !== "none" ? calibrateMode : undefined);
      
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

        if (statusRes.status === "completed") {
          set({ result: statusRes.result });
        } else if (statusRes.status === "processing" || statusRes.status === "pending") {
          setTimeout(poll, 1000);
        }
      };

      poll();

    } catch (err: any) {
      set({ jobStatus: "failed", jobError: err.message });
    }
  }
}));
