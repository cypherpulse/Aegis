import { Target } from "lucide-react";

import { ConfidenceMeter, SeverityBadge, StatusText } from "@/components/common";
import { cn } from "@/lib/utils";
import type { RootCause } from "@/types/api";

export function RootCausePanel({
  rootCause,
  fallbackTitle,
  fallbackConfidence,
  running,
}: {
  rootCause: RootCause | null;
  fallbackTitle?: string | undefined;
  fallbackConfidence?: number | undefined;
  running: boolean;
}) {
  if (!rootCause) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Target className="size-4" />
          <span className="font-display text-sm font-semibold">Root Cause</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {running
            ? fallbackTitle
              ? `Synthesizing — ${fallbackTitle}…`
              : "Synthesizing root cause from correlated evidence…"
            : "Root cause will appear when the investigation completes."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-b from-primary/[0.07] to-card">
      <div className="border-b border-primary/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            Root Cause Identified
          </span>
          <StatusText status={rootCause.status} className="ml-auto" />
        </div>
        <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-foreground">
          {rootCause.title}
        </h2>
      </div>

      <div className="grid gap-6 px-6 py-5 md:grid-cols-[1fr_240px]">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-foreground/85">{rootCause.explanation}</p>
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Contributing factors
            </p>
            <ul className="space-y-2">
              {rootCause.contributingFactors.map((factor, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-primary">
                    {Math.round(factor.weight * 100)}%
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max(0, Math.min(1, factor.weight)) * 100}%` }}
                    />
                  </div>
                  <span className="min-w-0 flex-[2] text-xs text-foreground/80">
                    {factor.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4 md:border-l md:border-border md:pl-6">
          <ConfidenceMeter value={rootCause.confidence} />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Severity
            </span>
            <SeverityBadge severity={rootCause.severity} />
          </div>
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Supporting evidence
            </p>
            <div className="flex flex-wrap gap-1.5">
              {rootCause.evidence.map((ev, i) => (
                <span
                  key={i}
                  className={cn(
                    "rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]",
                  )}
                >
                  {ev.source}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
