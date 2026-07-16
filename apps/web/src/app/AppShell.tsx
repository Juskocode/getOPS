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
import { NavLink, Outlet } from "react-router-dom";

import { apiClient } from "../api/client";
import { useProfileState } from "../state/profile-state";

const navigation = [
  { to: "/", label: "Today", icon: Activity, end: true },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/practice/flashcards", label: "Practice", icon: Layers3 },
  { to: "/simulate", label: "Simulate", icon: RadioTower },
  { to: "/profile", label: "Progress", icon: GraduationCap },
];

export function AppShell() {
  const { state, record, isSaving, lastError, clearError } = useProfileState();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiClient.health(),
    refetchInterval: 30_000,
    retry: 1,
  });

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
        <div className="runtime-strip" aria-label="Runtime status">
          <span data-tone={health.isSuccess ? "healthy" : "warning"}>
            <Server size={15} />
            {health.data?.version === "legacy" ? "Legacy API" : "C++ API"}
          </span>
          <span data-tone={health.data?.database === "ready" ? "healthy" : "neutral"}>
            <Database size={15} />
            {health.data?.database === "ready" ? "PostgreSQL" : "Transition"}
          </span>
          <NavLink className="profile-link" to="/profile">
            <CircleUserRound size={17} />
            {state.displayName || "Operator"}
          </NavLink>
        </div>
      </header>

      <aside className="side-rail">
        <div className="rank-block">
          <span>RANK SIGNAL</span>
          <strong>{Number(state.xp ?? 0).toLocaleString()} XP</strong>
          <small>Profile revision {record.revision}</small>
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
