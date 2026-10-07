import { ApiClient } from "./types";
import { MockApiClient } from "./mock";

export * from "./types";

class RealApiClient implements ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async predict(
    image: File,
    labels?: File,
    reference?: File,
    calibrate?: "georeferenced" | "relative" | "none"
  ) {
    const formData = new FormData();
    formData.append("image", image);
    if (labels) formData.append("labels", labels);
    if (reference) formData.append("reference", reference);
    if (calibrate) formData.append("calibrate", calibrate);

    const res = await fetch(`${this.baseUrl}/api/v1/predict`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to predict: ${res.statusText}`);
    }

    return await res.json();
  }

  async getJobStatus(jobId: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/jobs/${jobId}`);
    
    if (!res.ok) {
      throw new Error(`Failed to fetch job status: ${res.statusText}`);
    }

    return await res.json();
  }
}

// Ensure the mock mode warning is explicitly handled by Vite.
export const isMockMode = import.meta.env.VITE_USE_MOCK === "true";

export const api: ApiClient = isMockMode 
  ? new MockApiClient()
  : new RealApiClient(import.meta.env.VITE_API_BASE_URL || "http://localhost:8000");
