import { cn } from "@/lib/utils";
import type { NodeState } from "@/lib/pipeline";
import type { SseConnectionState } from "@/services/sse";
import type { InvestigationStatus, Severity } from "@/types/api";

export const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: "border-destructive/40 bg-destructive/10 text-destructive",
  HIGH: "border-primary/40 bg-primary/10 text-primary",
  MEDIUM: "border-warning/40 bg-[oklch(0.78_0.15_75_/_12%)] text-warning",
  LOW: "border-border bg-muted/50 text-muted-foreground",
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
        SEVERITY_STYLES[severity],
        className,
      )}
    >
      {severity}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  QUEUED: "text-muted-foreground",
  RUNNING: "text-primary",
  INVESTIGATING: "text-primary",
  COMPLETE: "text-success",
  INVESTIGATION_COMPLETE: "text-success",
  PARTIAL: "text-warning",
  FAILED: "text-destructive",
  DETECTED: "text-muted-foreground",
};

export function StatusText({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-xs font-medium uppercase tracking-wider",
        STATUS_STYLES[status] ?? "text-muted-foreground",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export const NODE_STATE_DOT: Record<NodeState, string> = {
  waiting: "bg-muted-foreground/40",
  active: "bg-primary aegis-pulse",
  complete: "bg-success",
  partial: "bg-warning",
  failed: "bg-destructive",
  approval: "bg-primary aegis-pulse",
};

export function StateDot({ state, className }: { state: NodeState; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", NODE_STATE_DOT[state], className)}
      aria-hidden
    />
  );
}

export function ConfidenceMeter({
  value,
  label = "Confidence",
}: {
  value: number | undefined;
  label?: string;
}) {
  const pct = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="font-display text-2xl font-semibold tabular-nums text-primary">
          {typeof value === "number" ? `${Math.round(pct * 100)}%` : "—"}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

const CONNECTION_LABEL: Record<SseConnectionState, string> = {
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  closed: "Offline",
};

const CONNECTION_DOT: Record<SseConnectionState, string> = {
  connecting: "bg-warning aegis-pulse",
  open: "bg-success aegis-pulse",
  reconnecting: "bg-warning aegis-pulse",
  closed: "bg-muted-foreground/50",
};

export function ConnectionIndicator({
  state,
  className,
}: {
  state: SseConnectionState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", CONNECTION_DOT[state])} />
      {CONNECTION_LABEL[state]}
    </span>
  );
}

export function investigationTone(status: InvestigationStatus | undefined): string {
  return status ? (STATUS_STYLES[status] ?? "text-muted-foreground") : "text-muted-foreground";
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>;
}
