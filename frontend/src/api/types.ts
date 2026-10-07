import { z } from "zod";

// --- Backend API Schemas ---
export const JobCreatedSchema = z.object({
  job_id: z.string(),
  status_url: z.string(),
});
export type JobCreated = z.infer<typeof JobCreatedSchema>;

export const JobStatusSchema = z.object({
  job_id: z.string(),
  status: z.enum(["queued", "processing", "done", "failed"]),
  error: z.string().nullable().optional(),
  metadata_url: z.string().nullable().optional(),
});
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ClassStatsSchema = z.object({
  rmse: z.number(),
  n_ref: z.number(),
  scale: z.number(),
  shift: z.number(),
});
export type ClassStats = z.infer<typeof ClassStatsSchema>;

export const MetadataSchema = z.object({
  job_id: z.string(),
  mode: z.enum(["georeferenced", "relative"]),
  units: z.enum(["metres", "normalized"]),
  width: z.number(),
  height: z.number(),
  height_min: z.number(),
  height_max: z.number(),
  heightmap_encoding: z.string(),
  pixel_size_m: z.number().nullable().optional(),
  mean_confidence: z.number(),
  crs: z.string().nullable().optional(),
  transform: z.array(z.number()).length(6).nullable().optional(),
  classes: z.record(z.string(), ClassStatsSchema),
  files: z.record(z.string(), z.string()),
  is_georeferenced: z.boolean(),
  bounds_wgs84: z.array(z.number()).nullable().optional(),
  srtm_error: z.string().nullable().optional(),
});
export type Metadata = z.infer<typeof MetadataSchema>;

// --- Frontend Internal Types ---
export type JobResult = {
  status: "queued" | "processing" | "done" | "failed";
  progress: number;
  stage: string;
  error?: string | null;
  result?: {
    heightmapUrl: string;
    confidenceUrl?: string;
    textureUrl?: string;
    meta: Metadata;
  } | null;
};

export interface PredictResponse {
  jobId: string;
  statusUrl: string;
}

export interface ApiClient {
  ping(): Promise<boolean>;
  setBaseUrl(url: string): void;
  getFileUrl(relativePath: string): Promise<string>;
  
  predict(
    image: File,
    labels?: File,
    reference?: File,
    calibrate?: "georeferenced" | "relative" | "none",
    signal?: AbortSignal
  ): Promise<PredictResponse>;
  
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobResult>;
}
