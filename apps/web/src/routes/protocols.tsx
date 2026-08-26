import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /protocols/* — renders the matched child (list or detail).
export const Route = createFileRoute("/protocols")({
  component: () => <Outlet />,
});
