import {
  progressStateSchema,
  type ProfileStateResponse,
  type ProgressState,
} from "@getops/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiClient, GetOpsApiError, type LoadedProfile } from "../api/client";

const PROFILE_QUERY_KEY = ["profile", "local"] as const;

const initialState: ProgressState = {
  uiVersion: 30,
  xp: 0,
  displayName: "Operator",
  profileObjective: "Trading operations next round",
  flashDrafts: {},
  flashAttempts: [],
  selectedFlashAttempt: "",
  flashActiveId: "f01",
  flashRecent: [],
  flashIndex: 0,
  flashRevealed: false,
  flashRewardClaims: [],
};

function normalizeProfile(record: LoadedProfile): LoadedProfile {
  const state = progressStateSchema.parse({
    ...initialState,
    ...(record.state ?? {}),
    uiVersion: Math.max(30, Number(record.state?.uiVersion ?? 0)),
  });
  return { ...record, state };
}

interface ProfileStateContextValue {
  record: LoadedProfile;
  state: ProgressState;
  isSaving: boolean;
  lastError: string;
  save: (update: (state: ProgressState) => ProgressState) => Promise<ProfileStateResponse>;
  clearError: () => void;
}

const ProfileStateContext = createContext<ProfileStateContextValue | null>(null);

export function ProfileStateProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState("");
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => normalizeProfile(await apiClient.loadProfile()),
    staleTime: 10_000,
    retry: 2,
  });

  const save = useCallback(
    (update: (state: ProgressState) => ProgressState) => {
      const task = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          const current = queryClient.getQueryData<LoadedProfile>(PROFILE_QUERY_KEY);
          if (!current?.state) throw new Error("Profile state is not loaded.");
          setIsSaving(true);
          setLastError("");
          try {
            const next = progressStateSchema.parse(update(current.state));
            const saved = normalizeProfile(await apiClient.saveProfile(current, next));
            queryClient.setQueryData(PROFILE_QUERY_KEY, saved);
            return saved;
          } catch (error) {
            if (error instanceof GetOpsApiError && error.status === 409) {
              await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
              setLastError("A newer profile revision was loaded. Reapply the change.");
            } else {
              setLastError(error instanceof Error ? error.message : "Profile save failed.");
            }
            throw error;
          } finally {
            setIsSaving(false);
          }
        });
      saveQueue.current = task;
      return task;
    },
    [queryClient],
  );

  const clearError = useCallback(() => setLastError(""), []);

  const value = useMemo<ProfileStateContextValue | null>(() => {
    if (!profileQuery.data?.state) return null;
    return {
      record: profileQuery.data,
      state: profileQuery.data.state,
      isSaving,
      lastError,
      save,
      clearError,
    };
  }, [clearError, isSaving, lastError, profileQuery.data, save]);

  if (profileQuery.isPending) {
    return (
      <div className="boot-screen" role="status">
        <div className="boot-mark" />
        <strong>Loading operator state</strong>
        <span>Connecting client, API, and persistence contracts.</span>
      </div>
    );
  }

  if (profileQuery.isError || !value) {
    return (
      <div className="boot-screen boot-screen-error" role="alert">
        <strong>Operator state is unavailable</strong>
        <span>{profileQuery.error?.message ?? "The profile response was invalid."}</span>
        <button type="button" onClick={() => void profileQuery.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return <ProfileStateContext.Provider value={value}>{children}</ProfileStateContext.Provider>;
}

export function useProfileState(): ProfileStateContextValue {
  const context = useContext(ProfileStateContext);
  if (!context) throw new Error("useProfileState must be used inside ProfileStateProvider.");
  return context;
}
