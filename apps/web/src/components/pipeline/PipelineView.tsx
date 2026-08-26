import {
  Activity,
  AlertTriangle,
  Boxes,
  Code2,
  Container,
  Cpu,
  Network,
  Radar,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { StateDot } from "@/components/common";
import { formatConfidence } from "@/lib/event-copy";
import type { InvestigatorNodeInfo, NodeState, PipelineState } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<NodeState, string> = {
  waiting: "Waiting",
  active: "Running",
  complete: "Complete",
  partial: "Partial",
  failed: "Failed",
  approval: "Approval",
};

const CARD_STATE: Record<NodeState, string> = {
  waiting: "border-border/70 bg-card/40 text-muted-foreground",
  active: "border-primary/50 bg-primary/[0.06] text-foreground aegis-glow",
  complete: "border-border bg-card text-foreground",
  partial: "border-warning/40 bg-[oklch(0.78_0.15_75_/_7%)] text-foreground",
  failed: "border-destructive/40 bg-destructive/[0.06] text-foreground",
  approval: "border-primary/50 bg-primary/[0.06] text-foreground aegis-glow",
};

function Stage({
  icon: Icon,
  title,
  state,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  state: NodeState;
  detail?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 transition-colors", CARD_STATE[state])}>
      <div className="flex items-center gap-3">
        <Icon
          className={cn(
            "size-4 shrink-0",
            state === "active" ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="font-display text-sm font-semibold">{title}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {STATE_LABEL[state]}
          </span>
          <StateDot state={state} />
        </span>
      </div>
      {detail ? <div className="mt-2 pl-7 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function Connector() {
  return <div className="mx-auto h-4 w-px bg-border" aria-hidden />;
}

function InvestigatorCard({
  title,
  icon: Icon,
  info,
}: {
  title: string;
  icon: LucideIcon;
  info: InvestigatorNodeInfo;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-3 transition-colors", CARD_STATE[info.state])}>
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-4",
            info.state === "active" ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="text-xs font-semibold">{title}</span>
        <StateDot state={info.state} className="ml-auto" />
      </div>
      <div className="mt-2 min-h-4 font-mono text-[10px] text-muted-foreground">
        {info.state === "active" && info.lastTool ? (
          <span>
            <span className="text-primary">›</span> {info.lastTool}
          </span>
        ) : info.state === "complete" || info.state === "partial" ? (
          <span>conf {formatConfidence(info.confidence)}</span>
        ) : info.state === "failed" ? (
          <span className="text-destructive">failed</span>
        ) : (
          <span>{info.tools.length ? `${info.tools.length} tools` : "queued"}</span>
        )}
      </div>
    </div>
  );
}

export function PipelineView({ pipeline }: { pipeline: PipelineState }) {
  const { nodes, investigators, session, fusion, sandbox, code, rootCause } = pipeline;

  return (
    <div className="space-y-0">
      <Stage
        icon={AlertTriangle}
        title="Incident"
        state={nodes.incident}
        detail={pipeline.chain ? <>Chain · {pipeline.chain}</> : undefined}
      />
      <Connector />
      <Stage
        icon={Cpu}
        title="TrueForge Session"
        state={nodes.session}
        detail={
          session.mode ? (
            <span className="inline-flex items-center gap-2">
              <span className="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                {session.mode}
              </span>
              {session.sessionId ? <span className="font-mono">{session.sessionId}</span> : null}
            </span>
          ) : undefined
        }
      />
      <Connector />
      <Stage icon={Radar} title="Incident Commander" state={nodes.commander} />
      <Connector />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InvestigatorCard title="Blockchain" icon={Boxes} info={investigators.blockchain} />
        <InvestigatorCard title="Treasury" icon={Wallet} info={investigators.treasury} />
        <InvestigatorCard title="Application" icon={Activity} info={investigators.application} />
      </div>
      <Connector />
      <Stage
        icon={Network}
        title="Evidence Fusion"
        state={nodes.fusion}
        detail={
          fusion.hypothesis ? (
            <>
              {fusion.hypothesis} · {formatConfidence(fusion.confidence)}
            </>
          ) : undefined
        }
      />
      <Connector />
      <Stage
        icon={Code2}
        title="Code Investigator"
        state={nodes.code}
        detail={
          code.state === "complete"
            ? code.drains
              ? "Bug reproduced — top-up disabled while retrying"
              : `Analyzed · ${formatConfidence(code.confidence)}`
            : undefined
        }
      />
      <Connector />
      <Stage
        icon={Container}
        title="Sandbox"
        state={nodes.sandbox}
        detail={
          sandbox.driver ? (
            <span className="inline-flex items-center gap-2">
              <span className="rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                {sandbox.driver}
              </span>
              {sandbox.driver === "docker"
                ? "isolated container · network off"
                : "isolate · cleaned env"}
            </span>
          ) : undefined
        }
      />
      <Connector />
      <Stage
        icon={Target}
        title="Root Cause"
        state={nodes.rootCause}
        detail={
          rootCause.title ? (
            <>
              {rootCause.title} · {formatConfidence(rootCause.confidence)}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
