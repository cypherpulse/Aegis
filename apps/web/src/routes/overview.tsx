import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, AlertTriangle, ArrowRight, Boxes, Play, ShieldCheck } from "lucide-react";

import { SeverityBadge, StatusText } from "@/components/common";
import { AppShell } from "@/components/layout/AppShell";
import { formatDateTime } from "@/lib/event-copy";
import { useCreateIncident, useIncidents } from "@/hooks/useIncidents";
import { useProtocols } from "@/hooks/useProtocols";
import { cn } from "@/lib/utils";
import type { Incident } from "@/types/api";

export const Route = createFileRoute("/overview")({
  head: () => ({ meta: [{ title: "Overview — Aegis" }] }),
  component: Overview,
});

function Overview() {
  const navigate = useNavigate();
  const protocols = useProtocols();
  const incidents = useIncidents({ limit: 8 });
  const create = useCreateIncident();

  const items = incidents.data?.items ?? [];
  const total = incidents.data?.total ?? 0;
  const critical = items.filter((i) => i.severity === "CRITICAL").length;
  const investigating = items.filter((i) => i.status === "INVESTIGATING").length;

  const launch = () =>
    create.mutate(
      {},
      {
        onSuccess: (r) =>
          void navigate({ to: "/incidents/$incidentId", params: { incidentId: r.incidentId } }),
      },
    );

  return (
    <AppShell
      right={
        <button
          onClick={launch}
          disabled={create.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Play className="size-3.5" /> Demo Investigation
        </button>
      }
    >
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
        Security Command Center
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight">Overview</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Boxes} label="Protocols" value={protocols.data?.total ?? 0} />
        <Stat icon={Activity} label="Incidents" value={total} />
        <Stat icon={AlertTriangle} label="Critical" value={critical} accent={critical > 0} />
        <Stat
          icon={ShieldCheck}
          label="Investigating"
          value={investigating}
          accent={investigating > 0}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]">
        {/* Recent incidents */}
        <section className="overflow-hidden rounded-xl border border-border bg-card/40">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="font-display text-sm font-semibold">Recent incidents</h2>
            <Link to="/incidents" className="font-mono text-[11px] text-primary hover:underline">
              View all
            </Link>
          </div>
          {incidents.isLoading ? (
            <div className="space-y-px">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-card/40" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="font-display text-base font-semibold">No incidents yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Your protocols are quiet.</p>
              <button
                onClick={launch}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/15"
              >
                <Play className="size-4" /> Run a demo investigation
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
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
            </ul>
          )}
        </section>

        {/* Protocols */}
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Protocols</h2>
            <Link to="/protocols" className="font-mono text-[11px] text-primary hover:underline">
              Manage
            </Link>
          </div>
          {(protocols.data?.items ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No protocols registered.</p>
              <Link
                to="/protocols"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Register one <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {(protocols.data?.items ?? []).slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link
                    to="/protocols/$protocolId"
                    params={{ protocolId: p.id }}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {p.primaryChain ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-5",
        accent ? "border-primary/40" : "border-border",
      )}
    >
      {accent ? <div className="absolute inset-x-0 top-0 h-px bg-primary/60" /> : null}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("size-4", accent ? "text-primary" : "text-muted-foreground/60")} />
      </div>
      <div
        className={cn(
          "mt-3 font-display text-4xl font-bold tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function IncidentRow({ incident, onOpen }: { incident: Incident; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-card/70"
      >
        <SeverityBadge severity={incident.severity} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{incident.title}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {incident.chain.name} · {incident.id}
          </div>
        </div>
        <StatusText status={incident.status} />
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">
          {formatDateTime(incident.detectedAt)}
        </span>
        <ArrowRight className="size-4 text-muted-foreground" />
      </button>
    </li>
  );
}
