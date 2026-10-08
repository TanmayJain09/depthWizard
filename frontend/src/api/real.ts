import type { ApiClient, PredictResponse, JobResult } from "./types";
import { JobStatusSchema, MetadataSchema } from "./types";

export class RealApiClient implements ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    // baseUrl can be "/api/v1" if proxied, or "http://localhost:8000/api/v1" if direct
    // For now we'll assume the caller passes the prefix if needed, or we use the vite proxy
    this.baseUrl = baseUrl;
  }

  async ping(): Promise<boolean> {
    if ((window as any).electron) {
      const res = await (window as any).electron.api.ping(this.baseUrl);
      if (!res.ok) throw new Error(res.error);
      return true;
    }
    const res = await fetch(`${this.baseUrl}/openapi.json`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  async getFileUrl(relativePath: string): Promise<string> {
    if ((window as any).electron) {
      // Fetch result file as blob URL via IPC
      const res = await (window as any).electron.api.getFile(this.baseUrl, relativePath);
      if (!res.ok) throw new Error(res.error);
      const buffer = res.buffer;
      let type = res.type || "application/octet-stream";
      if (relativePath.endsWith(".png")) type = "image/png";
      else if (relativePath.endsWith(".json")) type = "application/json";
      else if (relativePath.endsWith(".tif") || relativePath.endsWith(".tiff")) type = "image/tiff";
      const blob = new Blob([buffer], { type });
      return URL.createObjectURL(blob);
    }
    return `${this.baseUrl}${relativePath}`;
  }

  async predict(
    image: File,
    labels?: File,
    reference?: File,
    calibrate?: "georeferenced" | "relative" | "none",
    signal?: AbortSignal
  ): Promise<PredictResponse> {
    if ((window as any).electron) {
      const imgBuffer = await image.arrayBuffer();
      const labelsBuffer = labels ? await labels.arrayBuffer() : undefined;
      const refBuffer = reference ? await reference.arrayBuffer() : undefined;
      
      const res = await (window as any).electron.api.submitJob(this.baseUrl, {
        files: {
          image: { name: image.name, type: image.type, buffer: imgBuffer },
          labels: labels ? { name: labels.name, type: labels.type, buffer: labelsBuffer } : undefined,
          reference: reference ? { name: reference.name, type: reference.type, buffer: refBuffer } : undefined,
        },
        fields: {
          calibrateMode: calibrate !== "none" ? calibrate : undefined
        }
      });
      if (!res.ok) throw new Error(res.error);
      return { jobId: res.data.job_id, statusUrl: res.data.status_url };
    }

    const formData = new FormData();
    formData.append("image", image);
    if (labels) formData.append("labels", labels);
    if (reference) formData.append("reference", reference);
    if (calibrate === "georeferenced") formData.append("robust", "false");

    const res = await fetch(`${this.baseUrl}/api/v1/process`, {
      method: "POST",
      body: formData,
      signal,
    });

    if (!res.ok) throw new Error(`Process failed: ${res.statusText}`);
    const data = await res.json();
    return { jobId: data.job_id, statusUrl: data.status_url };
  }

  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobResult> {
    let data;
    if ((window as any).electron) {
      const res = await (window as any).electron.api.pollJob(this.baseUrl, jobId);
      if (!res.ok) throw new Error(res.error);
      data = res.data;
    } else {
      const res = await fetch(`${this.baseUrl}/api/v1/jobs/${jobId}`, { signal });
      if (!res.ok) throw new Error(`Job status failed: ${res.statusText}`);
      data = await res.json();
    }

    const parsed = JobStatusSchema.parse(data);
    let resultPayload = null;

    if (parsed.status === "done" && parsed.metadata_url) {
      let metaData;
      if ((window as any).electron) {
        const fileRes = await (window as any).electron.api.getFile(this.baseUrl, parsed.metadata_url);
        if (!fileRes.ok) throw new Error(fileRes.error);
        const buffer = fileRes.buffer;
        const decoder = new TextDecoder();
        metaData = JSON.parse(decoder.decode(buffer));
      } else {
        const metaRes = await fetch(`${this.baseUrl}${parsed.metadata_url}`, { signal });
        if (!metaRes.ok) throw new Error(`Metadata fetch failed: ${metaRes.statusText}`);
        metaData = await metaRes.json();
      }
      
      const metadata = MetadataSchema.parse(metaData);
      
      // In electron, we generate Object URLs. In web, absolute URLs.
      const heightmapUrl = await this.getFileUrl(metadata.files.heightmap);
      const confidenceUrl = metadata.files.confidence ? await this.getFileUrl(metadata.files.confidence) : undefined;
      const textureUrl = metadata.files.texture ? await this.getFileUrl(metadata.files.texture) : undefined;

      resultPayload = {
        heightmapUrl,
        confidenceUrl,
        textureUrl,
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
