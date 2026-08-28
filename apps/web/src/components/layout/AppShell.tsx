import { Link, useNavigate } from "@tanstack/react-router";
import { Boxes, LayoutGrid, LogOut, Siren, Sparkles } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useLogout, useMe } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof Boxes; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      activeProps={{ className: "bg-accent text-foreground" }}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

export function AppShell({
  children,
  right,
  requireAuth = true,
}: {
  children: ReactNode;
  right?: ReactNode;
  /** Redirect to /login when signed out. Off for public demo surfaces. */
  requireAuth?: boolean;
}) {
  const navigate = useNavigate();
  const me = useMe();
  const logout = useLogout();
  const user = me.data?.user ?? null;

  // Redirect to /login when signed out on protected surfaces. The public demo
  // (incident viewing/running) passes requireAuth={false} and stays open.
  useEffect(() => {
    if (requireAuth && !me.isLoading && me.data && me.data.user === null) {
      void navigate({ to: "/login" });
    }
  }, [requireAuth, me.isLoading, me.data, navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <Link to="/" className="flex h-14 items-center gap-2 border-b border-border px-5">
          <img src="/logo.png" alt="Aegis" className="size-6 shrink-0" />
          <span className="font-display text-lg font-bold tracking-tight">AEGIS</span>
        </Link>
        <nav className="flex-1 space-y-1 p-3">
          <NavItem to="/overview" icon={LayoutGrid} label="Overview" />
          <NavItem to="/protocols" icon={Boxes} label="Protocols" />
          <NavItem to="/incidents" icon={Siren} label="Incidents" />
          <NavItem to="/assistant" icon={Sparkles} label="Assistant" />
        </nav>
        <div className="border-t border-border p-3">
          {user ? (
            <div className="space-y-2">
              <div className="truncate px-2 font-mono text-[11px] text-muted-foreground">
                {user.displayName || user.email || user.walletAddress || user.id}
              </div>
              <button
                onClick={() => logout.mutate()}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="size-4" /> Log out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-primary hover:bg-accent"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/85 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <img src="/logo.png" alt="Aegis" className="size-6 shrink-0" />
            <span className="font-display font-bold">AEGIS</span>
          </div>
          <div className={cn("ml-auto flex items-center gap-4")}>{right}</div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-24 pt-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation (sidebar is hidden on small screens). */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-background/95 backdrop-blur md:hidden">
        <MobileNavItem to="/overview" icon={LayoutGrid} label="Overview" />
        <MobileNavItem to="/protocols" icon={Boxes} label="Protocols" />
        <MobileNavItem to="/incidents" icon={Siren} label="Incidents" />
        <MobileNavItem to="/assistant" icon={Sparkles} label="Assistant" />
        {user ? (
          <button
            onClick={() => logout.mutate()}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground"
          >
            <LogOut className="size-5" /> Log out
          </button>
        ) : (
          <Link
            to="/login"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-primary"
          >
            <LogOut className="size-5 rotate-180" /> Sign in
          </Link>
        )}
      </nav>
    </div>
  );
}

function MobileNavItem({ to, icon: Icon, label }: { to: string; icon: typeof Boxes; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground transition-colors"
      activeProps={{ className: "text-primary" }}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}
