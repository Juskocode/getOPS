import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  CircleUserRound,
  Database,
  GraduationCap,
  Layers3,
  RadioTower,
  Server,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

import { apiClient } from "../api/client";
import { rankProgress } from "../domain/ranks";
import { useProfileState } from "../state/profile-state";
import { CommandPalette } from "./CommandPalette";

const navigation = [
  { to: "/", label: "Today", icon: Activity, end: true },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/practice/flashcards", label: "Practice", icon: Layers3 },
  { to: "/simulate", label: "Simulate", icon: RadioTower },
  { to: "/profile", label: "Progress", icon: GraduationCap },
];

export function AppShell() {
  const { state, record, isSaving, lastError, clearError } = useProfileState();
  const location = useLocation();
  const rank = rankProgress(Number(state.xp ?? 0));
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiClient.health(),
    refetchInterval: 30_000,
    retry: 1,
  });
  const apiLabel = health.isPending
    ? "Checking API"
    : health.isError
      ? "API unavailable"
      : health.data?.version === "legacy"
        ? "Legacy API"
        : "C++ API";
  const databaseLabel = health.isPending
    ? "Checking DB"
    : health.isError
      ? "DB unavailable"
      : health.data?.database === "ready"
        ? "PostgreSQL"
        : "Transition";

  useEffect(() => {
    globalThis.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="app-frame">
      <header className="product-bar">
        <div className="brand-lockup">
          <span className="brand-icon" aria-hidden="true">
            <RadioTower size={20} />
          </span>
          <span>
            <strong>getOPS</strong>
            <small>Trading operations command lab</small>
          </span>
        </div>
        <div className="product-actions">
          <CommandPalette />
          <div className="runtime-strip" aria-label="Runtime status">
            <span
              data-tone={health.isSuccess ? "healthy" : health.isError ? "warning" : "neutral"}
              title="API runtime"
            >
              <Server size={15} />
              {apiLabel}
            </span>
            <span
              data-tone={health.data?.database === "ready" ? "healthy" : health.isError ? "warning" : "neutral"}
              title="Persistence runtime"
            >
              <Database size={15} />
              {databaseLabel}
            </span>
            <NavLink className="profile-link" to="/profile" aria-label={`Open ${state.displayName || "Operator"} progress`}>
              <CircleUserRound size={18} />
              <span>
                <strong>{state.displayName || "Operator"}</strong>
                <small>{rank.current.name} · {rank.xp.toLocaleString()} XP</small>
              </span>
              <i aria-hidden="true"><span style={{ width: `${rank.progress}%` }} /></i>
            </NavLink>
          </div>
        </div>
      </header>

      <aside className="side-rail">
        <div className="rank-block">
          <span>OPERATOR GRADE</span>
          <strong>{rank.current.name}</strong>
          <small>Rank {rank.rankNumber} of {rank.totalRanks} · {rank.xp.toLocaleString()} XP</small>
          <div className="rank-progress"><span style={{ width: `${rank.progress}%` }} /></div>
          <small>{rank.next ? `${rank.xpToNext} XP to ${rank.next.name}` : "Maximum grade reached"}</small>
        </div>
        <nav aria-label="Primary navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} {...(end ? { end: true } : {})}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <a className="legacy-link" href="/legacy/">
          <span>Legacy workspace</span>
          <small>Pressure systems fallback</small>
        </a>
      </aside>

      <main className="workspace">
        {lastError ? (
          <div className="global-notice" role="alert">
            <span>{lastError}</span>
            <button type="button" onClick={clearError} aria-label="Dismiss save error">
              Dismiss
            </button>
          </div>
        ) : null}
        <Outlet />
      </main>

      <footer className="save-footer">
        <span className={isSaving ? "save-dot is-saving" : "save-dot"} />
        {isSaving ? "Saving revision" : `Revision ${record.revision} synchronized`}
      </footer>
    </div>
  );
}
