import type { ApiClient, PredictResponse, JobResult, Metadata } from "./types";
import { JobStatusSchema, MetadataSchema, JobCreatedSchema } from "./types";

export class RealApiClient implements ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    // baseUrl can be "/api/v1" if proxied, or "http://localhost:8000/api/v1" if direct
    // For now we'll assume the caller passes the prefix if needed, or we use the vite proxy
    this.baseUrl = baseUrl;
  }

  async predict(
    image: File,
    labels?: File,
    reference?: File,
    calibrate?: "georeferenced" | "relative" | "none",
    signal?: AbortSignal
  ): Promise<PredictResponse> {
    const formData = new FormData();
    formData.append("image", image);
    
    if (labels) {
      formData.append("labels", labels);
    }

    if (reference) {
      formData.append("reference", reference);
    }

    if (calibrate === "georeferenced") {
      formData.append("robust", "false"); // Just dummy logic for now
    }

    const res = await fetch(`${this.baseUrl}/api/v1/process`, {
      method: "POST",
      body: formData,
      signal,
    });

    if (!res.ok) {
      throw new Error(`Process failed: ${res.statusText} - ${await res.text()}`);
    }

    const data = await res.json();
    const parsed = JobCreatedSchema.parse(data);
    return {
      jobId: parsed.job_id,
      statusUrl: parsed.status_url,
    };
  }

  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/jobs/${jobId}`, { signal });
    if (!res.ok) {
      throw new Error(`Job status failed: ${res.statusText}`);
    }

    const data = await res.json();
    const parsed = JobStatusSchema.parse(data);

    let resultPayload = null;
    let metadata: Metadata | undefined = undefined;
    if (parsed.status === "done" && parsed.metadata_url) {
      // Fetch metadata
      const metaRes = await fetch(`${this.baseUrl}${parsed.metadata_url}`, { signal });
      if (!metaRes.ok) {
        throw new Error(`Metadata fetch failed: ${metaRes.statusText}`);
      }
      const metaData = await metaRes.json();
      metadata = MetadataSchema.parse(metaData);

      resultPayload = {
        heightmapUrl: `${this.baseUrl}${metadata.files.heightmap}`,
        confidenceUrl: metadata.files.confidence ? `${this.baseUrl}${metadata.files.confidence}` : undefined,
        textureUrl: metadata.files.texture ? `${this.baseUrl}${metadata.files.texture}` : undefined,
        meta: metadata,
      };
    }

    return {
      status: parsed.status,
      error: parsed.error,
      progress: parsed.status === "done" ? 100 : (parsed.status === "processing" ? 50 : 0),
      stage: parsed.status,
      result: resultPayload,
    };
  }
}
