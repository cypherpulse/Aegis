import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { captureAuthTokenFromUrl } from "./services/api";

export const getRouter = () => {
  // On the client, grab any #token=... left by the Google OAuth callback before
  // the app renders, so the first /auth/me call is already authenticated.
  if (typeof window !== "undefined") captureAuthTokenFromUrl();

  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
