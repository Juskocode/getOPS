import { describe, expect, it, vi } from "vitest";

import { GetOpsApiError, type LoadedProfile } from "../api/client";
import { isRevisionRace, saveProfileUpdate } from "./profile-state";

function profile(revision: number, xp: number): LoadedProfile {
  return {
    profile: "local",
    state: {
      uiVersion: 30,
      xp,
      flashDrafts: {},
      flashAttempts: [],
    },
    revision,
    updatedAt: "2026-08-01T10:00:00.000Z",
    etag: `"state-local-r${revision}"`,
    transport: "v3",
  };
}

describe("saveProfileUpdate", () => {
  it("recognizes an If-Match mismatch as a recoverable revision race", () => {
    expect(
      isRevisionRace(
        new GetOpsApiError(400, {
          error: "if_match_invalid",
          message: "If-Match does not match the request revision.",
        }),
      ),
    ).toBe(true);
  });

  it("reloads and reapplies an update after another tab advances the revision", async () => {
    const latest = profile(2, 5);
    const saveProfile = vi
      .fn()
      .mockRejectedValueOnce(
        new GetOpsApiError(409, {
          error: "revision_conflict",
          message: "Expected revision 1 but current revision is 2.",
          revision: 2,
        }),
      )
      .mockImplementationOnce(async (current: LoadedProfile, state: LoadedProfile["state"]) => ({
        ...current,
        state,
        revision: 3,
        etag: "\"state-local-r3\"",
      }));
    const loadProfile = vi.fn().mockResolvedValue(latest);

    const saved = await saveProfileUpdate(
      profile(1, 0),
      (state) => ({ ...state, xp: Number(state.xp ?? 0) + 10 }),
      { loadProfile, saveProfile },
    );

    expect(loadProfile).toHaveBeenCalledWith("local");
    expect(saveProfile).toHaveBeenCalledTimes(2);
    expect(saveProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: 2, etag: "\"state-local-r2\"" }),
      expect.objectContaining({ xp: 15 }),
    );
    expect(saved).toMatchObject({ revision: 3, state: { xp: 15 } });
  });
});
