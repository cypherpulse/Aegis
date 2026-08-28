import { Check, Loader2, X } from "lucide-react";

import type { NodeState, PipelineState } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

/** Aggregate the three investigator nodes into a single stage state. */
function investigatorsState(p: PipelineState): NodeState {
  const s = [p.nodes.blockchain, p.nodes.treasury, p.nodes.application];
  if (s.some((x) => x === "active" || x === "approval")) return "active";
  if (s.some((x) => x === "failed")) return "partial";
  if (s.every((x) => x === "complete" || x === "partial")) return "complete";
  if (s.some((x) => x === "complete")) return "active";
  return "waiting";
}

/**
 * Compact live progress strip of the agent's investigation stages, shown below
 * the capability cards. The currently-running stage pulses so you can see what
 * the agent is doing right now.
 */
export function StageStrip({ pipeline }: { pipeline: PipelineState }) {
  const steps: { label: string; state: NodeState }[] = [
    { label: "Session", state: pipeline.nodes.session },
    { label: "Commander", state: pipeline.nodes.commander },
    { label: "Investigators", state: investigatorsState(pipeline) },
    { label: "Fusion", state: pipeline.nodes.fusion },
    { label: "Code", state: pipeline.nodes.code },
    { label: "Sandbox", state: pipeline.nodes.sandbox },
    { label: "Root Cause", state: pipeline.nodes.rootCause },
  ];
  const finished = pipeline.overall.finished;
  const running = pipeline.overall.started && !finished;

  // The current stage = the explicitly-active node, else (while running) the
  // first stage that has not completed yet. This keeps the strip showing
  // progress even in the gaps between events (e.g. before session.created).
  let currentIdx = steps.findIndex((s) => s.state === "active");
  if (currentIdx === -1 && running) currentIdx = steps.findIndex((s) => s.state !== "complete");
  const current = currentIdx >= 0 ? steps[currentIdx] : undefined;

  return (
    <div className="rounded-xl border border-border bg-card/40 px-4 py-3">
      <div className="mb-2.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
        {running && current ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="text-foreground">Agent working — {current.label}</span>
          </>
        ) : (
          <span className={finished ? "text-primary" : "text-muted-foreground"}>
            {finished ? "Investigation complete" : "Awaiting investigation"}
          </span>
        )}
      </div>
      <ol className="flex items-center gap-1 overflow-x-auto">
        {steps.map((s, i) => {
          // While running, force the current stage to render as active so the
          // pulse tracks progress even before its own node event arrives.
          const state: NodeState = running && i === currentIdx ? "active" : s.state;
          return (
          <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors",
                  state === "complete" && "border-primary bg-primary/15 text-primary",
                  state === "active" &&
                    "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20 animate-pulse",
                  state === "partial" && "border-warning bg-warning/15 text-warning",
                  state === "failed" && "border-destructive bg-destructive/15 text-destructive",
                  (state === "waiting" || state === "approval") &&
                    "border-border bg-background text-muted-foreground",
                )}
              >
                {state === "complete" ? (
                  <Check className="size-3.5" />
                ) : state === "failed" ? (
                  <X className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "truncate text-center text-[10px]",
                  state === "active" ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span
                className={cn(
                  "h-px flex-1",
                  steps[i]!.state === "complete" ? "bg-primary/40" : "bg-border",
                )}
              />
            ) : null}
          </li>
          );
        })}
      </ol>
    </div>
  );
}
