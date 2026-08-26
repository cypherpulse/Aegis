import { Cpu, Database, ShieldCheck, Container } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PipelineState } from "@/lib/pipeline";

function Capability({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  tone?: "default" | "primary";
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
      <Icon
        className={cn("size-4", tone === "primary" ? "text-primary" : "text-muted-foreground")}
      />
      <div className="leading-tight">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-xs font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

export function CapabilityStrip({ pipeline }: { pipeline: PipelineState }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Capability
        icon={Cpu}
        label="TrueForge session"
        value={pipeline.session.mode ? pipeline.session.mode.toUpperCase() : "—"}
        tone="primary"
      />
      <Capability
        icon={Container}
        label="Sandbox"
        value={pipeline.sandbox.driver ? pipeline.sandbox.driver.toUpperCase() : "—"}
        tone="primary"
      />
      <Capability
        icon={ShieldCheck}
        label="Approval gate"
        value={pipeline.approvals.length ? `${pipeline.approvals.length} observed` : "none"}
      />
      <Capability icon={Database} label="Telemetry" value="Simulated fixtures" />
    </div>
  );
}

const GATE_STATE: Record<string, { label: string; className: string }> = {
  requested: { label: "Requested", className: "text-warning" },
  granted: { label: "Auto-granted", className: "text-success" },
  denied: { label: "Denied — blocked", className: "text-destructive" },
  timeout: { label: "Timed out — blocked", className: "text-destructive" },
};

export function ApprovalPanel({ pipeline }: { pipeline: PipelineState }) {
  const { approvals } = pipeline;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" />
        <span className="font-display text-sm font-semibold">Human-in-the-loop</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Investigation is autonomous; an irreversible action would stop here for human approval. In
        this read-only investigation, sensitive tools pass an observed gate.
      </p>
      <div className="mt-3 space-y-2">
        {approvals.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No approval gates triggered yet.
          </p>
        ) : (
          approvals.map((gate, i) => {
            const meta = GATE_STATE[gate.state] ?? GATE_STATE.requested!;
            return (
              <div
                key={`${gate.tool}-${i}`}
                className="flex items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2"
              >
                <span className="font-mono text-[11px] text-foreground">{gate.tool}</span>
                <span className={cn("ml-auto font-mono text-[11px]", meta.className)}>
                  {meta.label}
                  {gate.auto ? " (read-only)" : ""}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
