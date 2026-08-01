import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

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

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: "learn", element: <LearnPage /> },
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
        <ProfileStateProvider>
          <RouterProvider router={router} />
        </ProfileStateProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
