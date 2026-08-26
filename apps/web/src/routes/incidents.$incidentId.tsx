import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, RotateCw } from "lucide-react";

import { ConnectionIndicator, SeverityBadge, StatusText } from "@/components/common";
import { EventTimeline } from "@/components/events/EventTimeline";
import { AgentsPanel } from "@/components/investigation/AgentsPanel";
import { EvidencePanel } from "@/components/investigation/EvidencePanel";
import { ApprovalPanel, CapabilityStrip } from "@/components/investigation/InvestigationExtras";
import { RootCausePanel } from "@/components/investigation/RootCausePanel";
import { AppShell } from "@/components/layout/AppShell";
import { PipelineView } from "@/components/pipeline/PipelineView";
import { useIncident, useInvestigate, useRefetchOnCompletion } from "@/hooks/useIncident";
import { useIncidentEvents } from "@/hooks/useIncidentEvents";

export const Route = createFileRoute("/incidents/$incidentId")({
  head: () => ({ meta: [{ title: "Investigation — Aegis" }] }),
  component: IncidentDetailPage,
});

function IncidentDetailPage() {
  const { incidentId } = Route.useParams();
  const { events, pipeline, connection, historyError, reconnect } = useIncidentEvents(incidentId);
  const finished = pipeline.overall.finished;
  const detail = useIncident(incidentId, !finished);
  useRefetchOnCompletion(incidentId, finished);
  const investigate = useInvestigate(incidentId);

  const incident = detail.data?.incident;
  const investigation = detail.data?.investigation ?? null;
  const findings = detail.data?.findings ?? [];
  const rootCause = detail.data?.rootCause ?? null;

  const running =
    pipeline.overall.started && !finished
      ? true
      : investigation?.status === "RUNNING" || investigation?.status === "QUEUED";

  const headerStatus =
    investigation?.status ?? pipeline.overall.status ?? incident?.status ?? "QUEUED";

  if (detail.isError) {
    return (
      <AppShell requireAuth={false}>
        <div className="rounded-xl border border-border py-16 text-center">
          <h1 className="font-display text-lg font-semibold">Incident not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            No incident with id <span className="font-mono">{incidentId}</span>.
          </p>
          <Link
            to="/incidents"
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            <ArrowLeft className="size-4" /> Back to Incidents
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell requireAuth={false} right={<ConnectionIndicator state={connection} />}>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/incidents"
          className="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Incidents
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {incident ? <SeverityBadge severity={incident.severity} /> : null}
              <StatusText status={headerStatus} />
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
              {incident?.title ?? "Investigation"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>{incident?.id ?? incidentId}</span>
              {incident ? <span>· {incident.chain.name}</span> : null}
              {investigation?.stage ? <span>· stage {investigation.stage}</span> : null}
            </p>
          </div>
          <button
            onClick={() => investigate.mutate()}
            disabled={investigate.isPending || running}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            <RotateCw className={investigate.isPending ? "size-4 animate-spin" : "size-4"} />
            {running ? "Investigating…" : "Re-run"}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <CapabilityStrip pipeline={pipeline} />
      </div>

      {historyError ? (
        <div className="mb-4 flex items-center justify-between rounded-md border border-warning/40 bg-[oklch(0.78_0.15_75_/_8%)] px-4 py-2 text-xs text-warning">
          <span>Event history: {historyError}</span>
          <button onClick={reconnect} className="inline-flex items-center gap-1 hover:underline">
            <RefreshCw className="size-3.5" /> Reconnect
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* Left: root cause + pipeline */}
        <div className="space-y-6">
          <RootCausePanel
            rootCause={rootCause}
            fallbackTitle={pipeline.rootCause.title}
            fallbackConfidence={pipeline.rootCause.confidence}
            running={running}
          />
          <section className="rounded-xl border border-border bg-card/40 p-5">
            <h2 className="mb-4 font-display text-sm font-semibold">Investigation pipeline</h2>
            <PipelineView pipeline={pipeline} />
          </section>
        </div>

        {/* Right: live timeline + approval */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <div className="h-[520px] overflow-hidden rounded-xl border border-border bg-card/40">
            <EventTimeline events={events} />
          </div>
          <ApprovalPanel pipeline={pipeline} />
        </div>
      </div>

      {/* Agents + tool activity (persisted) */}
      <div className="mt-6">
        <AgentsPanel investigationId={investigation?.id} live={running} />
      </div>

      {/* Evidence */}
      <section className="mt-6">
        <h2 className="mb-4 font-display text-sm font-semibold">Evidence</h2>
        <EvidencePanel findings={findings} />
      </section>
    </AppShell>
  );
}
