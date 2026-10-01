import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient, type LoadedProfile } from "../api/client";
import { ProfileStateProvider, useProfileState } from "./profile-state";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Probe() {
  const { state, record, save, reload } = useProfileState();
  return <><output aria-label="Profile value">{record.revision}:{state.xp}</output>
    <button onClick={() => { void save((previous) => ({ ...previous, xp: (previous.xp ?? 0) + 1 })); }}>Add</button>
    <button onClick={() => { void reload(); }}>Reload</button></>;
}

describe("profile refresh serialization", () => {
  it("queues reload between writes and preserves the latest revision", async () => {
    let server: LoadedProfile = { profile: "local", revision: 1, state: { xp: 0 }, updatedAt: "2026-10-01T12:00:00Z", etag: '"state-local-r1"', transport: "v3" };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const load = vi.spyOn(apiClient, "loadProfile").mockImplementation(async () => server);
    const persist = vi.spyOn(apiClient, "saveProfile").mockImplementation(async (current, state) => {
      if (current.revision === 1) await gate;
      expect(current.revision).toBe(server.revision);
      server = { ...server, revision: server.revision + 1, state, etag: `"state-local-r${server.revision + 1}"` };
      return server;
    });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProfileStateProvider><Probe /></ProfileStateProvider></QueryClientProvider>);
    await screen.findByText("1:0");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(persist).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(load).toHaveBeenCalledOnce();
    await act(async () => { release(); await gate; });
    await screen.findByText("3:2");
    expect(load).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
