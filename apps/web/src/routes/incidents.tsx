import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /incidents/* — renders the matched child (list or detail).
export const Route = createFileRoute("/incidents")({
  component: () => <Outlet />,
});
