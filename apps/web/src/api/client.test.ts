import { afterEach, describe, expect, it, vi } from "vitest";

import { GetOpsApiClient } from "./client";

const emptyState = {
  uiVersion: 30,
  xp: 0,
  flashDrafts: {},
  flashAttempts: [],
};

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
}

describe("GetOpsApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a v3 profile and preserves its ETag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          profile: "local",
          state: emptyState,
          revision: 7,
          updatedAt: "2026-07-16T10:20:30.000Z",
        },
        { headers: { ETag: "\"state-local-r7\"" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GetOpsApiClient().loadProfile();

    expect(result.transport).toBe("v3");
    expect(result.revision).toBe(7);
    expect(result.etag).toBe("\"state-local-r7\"");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back to the compatibility endpoint when v3 is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: "not_found", message: "No route" },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            profile: "local",
            state: emptyState,
            revision: 3,
            updated_at: "2026-07-16T10:20:30.000Z",
          },
          { headers: { ETag: "\"state-local-r3\"" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GetOpsApiClient().loadProfile();

    expect(result.transport).toBe("legacy");
    expect(result.revision).toBe(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/state?profile=local",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("surfaces optimistic concurrency conflicts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: "revision_conflict",
            message: "Expected revision 8 but current revision is 9.",
            revision: 9,
          },
          { status: 409 },
        ),
      ),
    );

    await expect(
      new GetOpsApiClient().saveProfile(
        {
          profile: "local",
          state: emptyState,
          revision: 8,
          updatedAt: "2026-07-16T10:20:30.000Z",
          etag: "\"state-local-r8\"",
          transport: "v3",
        },
        emptyState,
      ),
    ).rejects.toMatchObject({
      name: "GetOpsApiError",
      status: 409,
      message: "Expected revision 8 but current revision is 9.",
    });
  });
});
