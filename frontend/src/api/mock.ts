import { ApiClient, PredictResponse, JobResult, GeoMeta } from "./types";

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
}>();

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const randomFail = () => {
  if (Math.random() < MOCK_CONFIG.failProbability) {
    throw new Error("Network Error: Backend unreachable or returned 503");
  }
};

export class MockApiClient implements ApiClient {
  async predict(
    image: File,
    labels?: File,
    reference?: File,
    calibrate?: "georeferenced" | "relative" | "none"
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
      status: "pending",
      progress: 0,
      stage: "Queued",
      type: isGeoreferenced ? "georeferenced" : "relative"
    });

    // Start background processing simulation
    this.simulateJobProcessing(jobId);

    return {
      jobId,
      status: "pending",
      message: "Job submitted to mock backend"
    };
  }

  async getJobStatus(jobId: string): Promise<JobResult> {
    await sleep(MOCK_CONFIG.latencyMs / 2);
    randomFail();

    const job = JOB_DB.get(jobId);
    if (!job) {
      throw new Error("404 Not Found: Job ID does not exist");
    }

    if (job.status === "failed") {
      return { status: "failed", error: job.error };
    }

    if (job.status === "completed") {
      const isGeo = job.type === "georeferenced";
      const meta: GeoMeta = isGeo ? {
        crs: "EPSG:32755",
        transform: [144.9631, 1.0, 0, -37.8136, 0, -1.0],
        units: "m",
        minHeight: 0,
        maxHeight: 100
      } : {
        units: "relative",
        minHeight: 0,
        maxHeight: 1
      };

      return {
        status: "completed",
        progress: 100,
        stage: "Done",
        result: {
          dsmUrl: isGeo ? "/mock/dsm_absolute.tif" : "/mock/dsm_relative.png",
          confidenceUrl: isGeo ? "/mock/confidence.tif" : undefined,
          meta,
          classSummary: isGeo ? {
            "ground": { rmse: 2.1, n_ref: 50, scale: 1.0, shift: 0.0 },
            "vegetation": { rmse: 4.5, n_ref: 30, scale: 1.1, shift: 0.5 }
          } : undefined
        }
      };
    }

    return {
      status: job.status,
      progress: job.progress,
      stage: job.stage
    };
  }

  private async simulateJobProcessing(jobId: string) {
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
    job.status = "completed";
  }
}
