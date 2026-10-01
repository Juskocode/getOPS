import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";

import { FlashcardsPage } from "../features/flashcards/FlashcardsPage";
import { LearnPage } from "../features/learn/LearnPage";
import { ProfilePage } from "../features/profile/ProfilePage";
import { SimulatePage } from "../features/simulate/SimulatePage";
import { TodayPage } from "../features/today/TodayPage";
import { ProfileStateProvider } from "../state/profile-state";
import { AppShell } from "./AppShell";
import { ErrorBoundary } from "./ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function RouteLoading() {
  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <div className="boot-mark" aria-hidden="true" />
      <strong>Opening getOPS</strong>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/lab/galton",
    HydrateFallback: RouteLoading,
    lazy: async () => {
      const { GaltonLabRoute } = await import("../features/galton/GaltonLabRoute");
      return { Component: GaltonLabRoute };
    },
  },
  {
    path: "/",
    HydrateFallback: RouteLoading,
    element: <ProfileStateProvider><AppShell /></ProfileStateProvider>,
    children: [
      { index: true, element: <TodayPage /> },
      { path: "learn", element: <LearnPage /> },
      {
        path: "learn/infrastructure",
        lazy: async () => {
          const { InfrastructurePage } = await import("../features/infrastructure/InfrastructurePage");
          return { Component: InfrastructurePage };
        },
      },
      {
        path: "learn/infrastructure/:lessonId",
        lazy: async () => {
          const { InfrastructureLessonPage } = await import("../features/infrastructure/InfrastructureLessonPage");
          return { Component: InfrastructureLessonPage };
        },
      },
      {
        path: "learn/:branchId",
        lazy: async () => {
          const { DeepDivePage } = await import("../features/learn/DeepDivePage");
          return { Component: DeepDivePage };
        },
      },
      { path: "practice", element: <Navigate to="/practice/flashcards" replace /> },
      { path: "practice/flashcards", element: <FlashcardsPage /> },
      { path: "simulate", element: <SimulatePage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
