import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Play, RefreshCw } from "lucide-react";

import { SeverityBadge, StatusText } from "@/components/common";
import { AppShell } from "@/components/layout/AppShell";
import { formatDateTime } from "@/lib/event-copy";
import { useCreateIncident, useIncidents } from "@/hooks/useIncidents";
import type { Incident } from "@/types/api";

export const Route = createFileRoute("/incidents/")({
  head: () => ({ meta: [{ title: "Incidents — Aegis" }] }),
  component: IncidentsPage,
});

function IncidentsPage() {
  const navigate = useNavigate();
  const incidents = useIncidents();
  const create = useCreateIncident();

  const launch = () => {
    create.mutate(
      {},
      {
        onSuccess: (res) => {
          void navigate({ to: "/incidents/$incidentId", params: { incidentId: res.incidentId } });
        },
      },
    );
  };

  const items = incidents.data?.items ?? [];

  return (
    <AppShell requireAuth={false}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Incidents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {incidents.data ? `${incidents.data.total} total` : "Loading…"}
          </p>
        </div>
        <button
          onClick={launch}
          disabled={create.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {create.isPending ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          Launch Investigation
        </button>
      </div>

      {create.isError ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Could not create incident. Is the API running at the configured base URL?
        </p>
      ) : null}

      {incidents.isError ? (
        <ErrorState onRetry={() => void incidents.refetch()} />
      ) : incidents.isLoading ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <EmptyState onLaunch={launch} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/50 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Incident</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Chain</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Detected</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  onOpen={() =>
                    void navigate({
                      to: "/incidents/$incidentId",
                      params: { incidentId: incident.id },
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function IncidentRow({ incident, onOpen }: { incident: Incident; onOpen: () => void }) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-card/60"
    >
      <td className="px-4 py-3">
        <SeverityBadge severity={incident.severity} />
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">{incident.title}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{incident.id}</div>
      </td>
      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
        {incident.chain.name}
      </td>
      <td className="px-4 py-3">
        <StatusText status={incident.status} />
      </td>
      <td className="hidden px-4 py-3 font-mono text-[11px] text-muted-foreground md:table-cell">
        {formatDateTime(incident.detectedAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <ArrowRight className="ml-auto size-4 text-muted-foreground" />
      </td>
    </tr>
  );
}

function EmptyState({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border py-16 text-center">
      <h2 className="font-display text-lg font-semibold">No active incidents</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your protocols are quiet.</p>
      <button
        onClick={onLaunch}
        className="mt-5 inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15"
      >
        <Play className="size-4" /> Launch a demo investigation
      </button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 py-14 text-center">
      <h2 className="font-display text-lg font-semibold">Can't reach the Aegis API</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Start the backend, then retry. See <span className="font-mono">.env.example</span> for the
        base URL.
      </p>
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
      >
        <RefreshCw className="size-4" /> Retry
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-card/40" />
      ))}
    </div>
  );
}
