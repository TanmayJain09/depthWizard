import { JobStatusSchema, MetadataSchema } from "./types";
import type { PredictResponse, JobResult } from "./types";
import * as mockApi from "./mock";

export * from "./types";

let baseUrl = import.meta.env.VITE_API_BASE_URL || "";
export const isMockMode = import.meta.env.VITE_USE_MOCK === "true";

export function setBaseUrl(url: string): void {
  baseUrl = url;
}

export async function ping(): Promise<boolean> {
  if (isMockMode) return mockApi.ping();
  const res = await fetch(`${baseUrl}/openapi.json`, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return true;
}

export function getFileUrl(jid: string, filename: string): string {
  if (isMockMode) return mockApi.getFileUrl(jid, filename);
  return `${baseUrl}/api/v1/jobs/${jid}/${filename}`;
}

export async function predict(
  image: File,
  labels?: File,
  reference?: File,
  calibrate?: "georeferenced" | "relative" | "none",
  robust?: boolean,
  approxPixelSizeM?: string,
  signal?: AbortSignal
): Promise<PredictResponse> {
  if (isMockMode) return mockApi.predict(image, labels, reference, calibrate, signal);
  const formData = new FormData();
  formData.append("image", image);
  if (labels) formData.append("labels", labels);
  if (reference) formData.append("reference", reference);
  if (calibrate && calibrate !== "none") formData.append("calibrate", calibrate);
  if (robust) formData.append("robust", "true");
  if (approxPixelSizeM) formData.append("approx_pixel_size_m", approxPixelSizeM);

  const res = await fetch(`${baseUrl}/api/v1/process`, {
    method: "POST",
    body: formData,
    signal,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Process failed: ${res.statusText} - ${txt}`);
  }
  const data = await res.json();
  return { jobId: data.job_id, statusUrl: data.status_url };
}

export async function getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobResult> {
  if (isMockMode) return mockApi.getJobStatus(jobId, signal);
  const res = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, { signal });
  if (!res.ok) throw new Error(`Job status failed: ${res.statusText}`);
  const data = await res.json();

  const parsed = JobStatusSchema.parse(data);
  let resultPayload = null;

  if (parsed.status === "done" && parsed.metadata_url) {
    const metaRes = await fetch(`${baseUrl}${parsed.metadata_url}`, { signal });
    if (!metaRes.ok) throw new Error(`Metadata fetch failed: ${metaRes.statusText}`);
    const metaData = await metaRes.json();
    
    const metadata = MetadataSchema.parse(metaData);
    
    const heightmapUrl = getFileUrl(jobId, "heightmap.png");
    const confidenceUrl = metadata.files.confidence ? getFileUrl(jobId, "confidence.png") : undefined;
    const textureUrl = metadata.files.texture ? getFileUrl(jobId, "texture.jpg") : undefined;
    const calibratedGeoreferenceUrl = metadata.files.calibrated_georeference ? getFileUrl(jobId, "calibrated_georeference.tif") : undefined;

    resultPayload = {
      heightmapUrl,
      confidenceUrl,
      textureUrl,
      calibratedGeoreferenceUrl,
      meta: metadata,
    };
  }

  // Parse progress and stage
  let progress = 0;
  let stageStr = parsed.stage || "queued";
  if (parsed.status === "done") {
    progress = 100;
  } else if (parsed.status === "processing") {
    if (stageStr === "loading") progress = 10;
    else if (stageStr === "depth") progress = 30;
    else if (stageStr === "segmentation") progress = 60;
    else if (stageStr === "calibration") progress = 85;
    else if (stageStr === "writing") progress = 95;
    else progress = 50;
  }

  return {
    status: parsed.status,
    error: parsed.error,
    progress,
    stage: stageStr,
    result: resultPayload,
  };
}

export const api = {
  setBaseUrl,
  ping,
  getFileUrl,
  predict,
  getJobStatus,
};
