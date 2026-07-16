import {
  apiErrorSchema,
  healthResponseSchema,
  profileStateResponseSchema,
  recallValidationResponseSchema,
  type ApiError,
  type HealthResponse,
  type ProfileStateResponse,
  type ProgressState,
  type RecallValidationRequest,
  type RecallValidationResponse,
} from "@getops/contracts";

const REQUEST_TIMEOUT_MS = 7_000;

export class GetOpsApiError extends Error {
  readonly status: number;
  readonly payload: ApiError | null;

  constructor(status: number, payload: ApiError | null) {
    super(payload?.message ?? payload?.error ?? `API request failed with ${status}`);
    this.name = "GetOpsApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface LoadedProfile extends ProfileStateResponse {
  etag: string;
  transport: "v3" | "legacy";
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchJson(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-Request-ID": requestId(),
        ...init.headers,
      },
    });
    const payload =
      response.status === 204 || response.status === 304
        ? null
        : await response.json().catch(() => null);
    if (!response.ok && response.status !== 304) {
      const parsed = apiErrorSchema.safeParse(payload);
      throw new GetOpsApiError(response.status, parsed.success ? parsed.data : null);
    }
    return { response, payload };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function normalizeLegacyProfile(payload: unknown, etag: string): LoadedProfile {
  if (!payload || typeof payload !== "object") {
    throw new Error("Legacy profile response is not an object.");
  }
  const candidate = payload as Record<string, unknown>;
  const parsed = profileStateResponseSchema.parse({
    profile: candidate.profile,
    state: candidate.state,
    revision: candidate.revision,
    updatedAt: candidate.updatedAt ?? candidate.updated_at ?? null,
  });
  return { ...parsed, etag, transport: "legacy" };
}

export class GetOpsApiClient {
  async health(): Promise<HealthResponse> {
    try {
      const { payload } = await fetchJson("/api/v1/health/ready");
      return healthResponseSchema.parse(payload);
    } catch (error) {
      if (!(error instanceof GetOpsApiError) || error.status !== 404) throw error;
      await fetchJson("/api/health/ready");
      return {
        status: "ok",
        service: "getops-api",
        version: "legacy",
        database: "not-checked",
      };
    }
  }

  async loadProfile(profile = "local", etag = ""): Promise<LoadedProfile> {
    try {
      const { response, payload } = await fetchJson(
        `/api/v1/profiles/${encodeURIComponent(profile)}/state`,
        { headers: etag ? { "If-None-Match": etag } : {} },
      );
      if (response.status === 304) {
        throw new Error("A 304 response requires a caller-side cached profile.");
      }
      const parsed = profileStateResponseSchema.parse(payload);
      return {
        ...parsed,
        etag: response.headers.get("ETag") ?? "",
        transport: "v3",
      };
    } catch (error) {
      if (!(error instanceof GetOpsApiError) || error.status !== 404) throw error;
      const { response, payload } = await fetchJson(
        `/api/state?profile=${encodeURIComponent(profile)}`,
        { headers: etag ? { "If-None-Match": etag } : {} },
      );
      return normalizeLegacyProfile(payload, response.headers.get("ETag") ?? "");
    }
  }

  async saveProfile(current: LoadedProfile, state: ProgressState): Promise<LoadedProfile> {
    const path =
      current.transport === "v3"
        ? `/api/v1/profiles/${encodeURIComponent(current.profile)}/state`
        : "/api/state";
    const body =
      current.transport === "v3"
        ? { revision: current.revision, state }
        : { profile: current.profile, revision: current.revision, state };
    const { response, payload } = await fetchJson(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(current.etag ? { "If-Match": current.etag } : {}),
      },
      body: JSON.stringify(body),
    });
    if (current.transport === "legacy") {
      return normalizeLegacyProfile(payload, response.headers.get("ETag") ?? "");
    }
    const parsed = profileStateResponseSchema.parse(payload);
    return {
      ...parsed,
      etag: response.headers.get("ETag") ?? "",
      transport: "v3",
    };
  }

  async validateRecall(input: RecallValidationRequest): Promise<RecallValidationResponse> {
    const { payload } = await fetchJson("/api/v1/recall/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return recallValidationResponseSchema.parse(payload);
  }
}

export const apiClient = new GetOpsApiClient();
