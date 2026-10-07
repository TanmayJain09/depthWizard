import { z } from "zod";

// --- Base Types ---
export const GeoMetaSchema = z.object({
  crs: z.string().optional(),
  transform: z.array(z.number()).optional(),
  units: z.enum(["m", "relative", "unknown"]).optional(),
  minHeight: z.number().optional(),
  maxHeight: z.number().optional(),
});

export const ClassSummarySchema = z.record(
  z.string(),
  z.object({
    rmse: z.number(),
    n_ref: z.number(),
    scale: z.number(),
    shift: z.number(),
  })
);

export const ValidationReportSchema = z.object({
  rmse: z.number(),
  mae: z.number(),
  correlation: z.number(),
  bias: z.number(),
});

// --- API Request/Response Types ---
export const PredictResponseSchema = z.object({
  jobId: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  message: z.string().optional(),
});

export const JobResultSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number().optional(),
  stage: z.string().optional(),
  error: z.string().optional(),
  result: z.object({
    dsmUrl: z.string(),
    confidenceUrl: z.string().optional(),
    meta: GeoMetaSchema,
    classSummary: ClassSummarySchema.optional(),
  }).optional(),
});

export type GeoMeta = z.infer<typeof GeoMetaSchema>;
export type ClassSummary = z.infer<typeof ClassSummarySchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;
export type PredictResponse = z.infer<typeof PredictResponseSchema>;
export type JobResult = z.infer<typeof JobResultSchema>;

export interface ApiClient {
  predict(
    image: File,
    labels?: File,
    reference?: File,
    calibrate?: "georeferenced" | "relative" | "none"
  ): Promise<PredictResponse>;
  
  getJobStatus(jobId: string): Promise<JobResult>;
}
