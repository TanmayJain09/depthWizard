import type { ApiClient } from "./types";
import { MockApiClient } from "./mock";
import { RealApiClient } from "./real";

export * from "./types";

export const isMockMode = import.meta.env.VITE_USE_MOCK !== "false";

export const api: ApiClient = isMockMode 
  ? new MockApiClient()
  : new RealApiClient(import.meta.env.VITE_API_BASE_URL || "");
