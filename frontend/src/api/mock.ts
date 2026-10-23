import type { PredictResponse, JobResult, Metadata } from "./types";
import { encode } from "fast-png";

// Configuration for the mock behavior
const MOCK_CONFIG = {
  latencyMs: 800,
  failProbability: 0.05, // 5% chance of random network failure
  failInvalidPayload: true,
};

const JOB_DB = new Map<string, {
  status: JobResult["status"];
  progress: number;
  stage: string;
  type: "georeferenced" | "relative";
  error?: string;
  mockResult?: any;
}>();

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const randomFail = () => {
  if (Math.random() < MOCK_CONFIG.failProbability) {
    throw new Error("Network Error: Backend unreachable or returned 503");
  }
};

function generateFakeHeightmap(width: number, height: number): string {
  const data = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = (Math.sin(x / 20) + Math.cos(y / 20) + 2) / 4; 
      data[y * width + x] = Math.floor(h * 65535);
    }
  }
  const pngBuffer = encode({ width, height, data, depth: 16, channels: 1 });
  const blob = new Blob([pngBuffer as any], { type: "image/png" });
  return URL.createObjectURL(blob);
}

function generateFakeTexture(width: number, height: number): string {
  // Simple RGB mock texture
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      data[idx] = Math.floor((x / width) * 255);     // R
      data[idx + 1] = Math.floor((y / height) * 255); // G
      data[idx + 2] = 128;                           // B
    }
  }
  const pngBuffer = encode({ width, height, data, depth: 8, channels: 3 });
  const blob = new Blob([pngBuffer as any], { type: "image/png" });
  return URL.createObjectURL(blob);
}

export function setBaseUrl(_url: string): void {}

export async function ping(): Promise<boolean> {
  await sleep(200);
  return true;
}

export function getFileUrl(_jid: string, relativePath: string): string {
  return relativePath; // Mock result payload generates blob URLs instead of relative paths, so just returning it is fine
}

export async function predict(
  image: File,
  _labels?: File,
  _reference?: File,
  _calibrate?: "georeferenced" | "relative" | "none",
  _signal?: AbortSignal
): Promise<PredictResponse> {
  await sleep(MOCK_CONFIG.latencyMs);
  randomFail();
  
  // Simulate invalid payload error
  if (image.size === 0) {
    throw new Error("400 Bad Request: Image is empty or invalid.");
  }

  const isGeoreferenced = image.name.toLowerCase().endsWith('.tif') || image.name.toLowerCase().endsWith('.tiff');
  const jobId = `mock-job-${Date.now()}`;
  
  JOB_DB.set(jobId, {
    status: "queued",
    progress: 0,
    stage: "Queued",
    type: isGeoreferenced ? "georeferenced" : "relative"
  });

  // Start background processing simulation
  simulateJobProcessing(jobId);

  return {
    jobId,
    statusUrl: `/api/v1/jobs/${jobId}`
  };
}

export async function getJobStatus(jobId: string, _signal?: AbortSignal): Promise<JobResult> {
  await sleep(MOCK_CONFIG.latencyMs / 2);
  randomFail();

  const job = JOB_DB.get(jobId);
  if (!job) {
    throw new Error("404 Not Found: Job ID does not exist");
  }

  if (job.status === "failed") {
    return { status: "failed", error: job.error, progress: job.progress, stage: job.stage };
  }

  if (job.status === "done") {
    return {
      status: "done",
      progress: 100,
      stage: "Done",
      result: job.mockResult
    };
  }

  return {
    status: job.status,
    progress: job.progress,
    stage: job.stage
  };
}

async function simulateJobProcessing(jobId: string) {
  const job = JOB_DB.get(jobId);
  if (!job) return;

  const stages = [
    { p: 10, s: "Loading inputs..." },
    { p: 30, s: "Estimating relative depth..." },
    { p: 60, s: "Extracting semantic classes..." },
    { p: 85, s: "Calibrating scale and shift..." },
    { p: 95, s: "Generating confidence map..." }
  ];

  job.status = "processing";

  for (const stage of stages) {
    await sleep(1200 + Math.random() * 800);
    job.progress = stage.p;
    job.stage = stage.s;
  }

  await sleep(800);
  
  const isGeo = job.type === "georeferenced";
  const meta: Metadata = {
    job_id: jobId,
    mode: isGeo ? "georeferenced" : "relative",
    units: isGeo ? "metres" : "normalized",
    width: 256,
    height: 256,
    height_min: isGeo ? 10 : 0,
    height_max: isGeo ? 50 : 1,
    heightmap_encoding: "16-bit grayscale PNG; value = height_min + (px/65535)*(height_max-height_min)",
    pixel_size_m: isGeo ? 0.5 : undefined,
    mean_confidence: 0.95,
    crs: isGeo ? "EPSG:32755" : undefined,
    transform: isGeo ? [144.9631, 0.5, 0, -37.8136, 0, -0.5] : undefined,
    classes: isGeo ? {
      "ground": { rmse: 2.1, n_ref: 50, scale: 1.0, shift: 0.0 },
      "vegetation": { rmse: 4.5, n_ref: 30, scale: 1.1, shift: 0.5 }
    } : {},
    files: {
      "heightmap": `/api/v1/jobs/${jobId}/heightmap.png`,
      "confidence": `/api/v1/jobs/${jobId}/confidence.png`,
    },
    is_georeferenced: isGeo,
    bounds_wgs84: isGeo ? [144.96, -37.81, 144.97, -37.82] : null,
    srtm_error: null
  };

  job.mockResult = {
    heightmapUrl: generateFakeHeightmap(256, 256),
    confidenceUrl: undefined,
    textureUrl: generateFakeTexture(256, 256),
    meta,
  };

  job.status = "done";
}
