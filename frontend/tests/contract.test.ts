// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { MetadataSchema, JobCreatedSchema, JobStatusSchema } from "../src/api/types";

const baseUrl = process.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

let backendOffline = false;

describe("Backend API Contract Tests", () => {
  beforeAll(async () => {
    // Ensure the backend is reachable
    try {
      const res = await fetch(`${baseUrl}/openapi.json`);
      if (!res.ok) throw new Error();
    } catch (_e) {
      console.warn(`Backend not reachable at ${baseUrl}. Contract tests will fail or be skipped.`);
      backendOffline = true;
    }
  });

  it.skipIf(() => backendOffline)("should validate job creation and status payload structures", async () => {
    // 1. Create a dummy image
    const blob = new Blob(["dummy image data"], { type: "image/png" });
    
    const formData = new FormData();
    formData.append("image", blob, "test_image.png");
    
    // 2. Submit to process
    const processRes = await fetch(`${baseUrl}/api/v1/process`, {
      method: "POST",
      body: formData
    });
    
    expect(processRes.ok).toBe(true);
    
    const processData = await processRes.json();
    const parsedJobCreated = JobCreatedSchema.safeParse(processData);
    expect(parsedJobCreated.success).toBe(true);
    
    const jobId = processData.job_id;
    
    // 3. Poll for status
    const statusRes = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`);
    expect(statusRes.ok).toBe(true);
    
    const statusData = await statusRes.json();
    const parsedJobStatus = JobStatusSchema.safeParse(statusData);
    expect(parsedJobStatus.success).toBe(true);
    
    // 4. Test metadata if done
    if (statusData.status === "done" && statusData.metadata_url) {
      const metaRes = await fetch(`${baseUrl}${statusData.metadata_url}`);
      expect(metaRes.ok).toBe(true);
      
      const metaData = await metaRes.json();
      const parsedMeta = MetadataSchema.safeParse(metaData);
      expect(parsedMeta.success).toBe(true);
    }
  });
});
