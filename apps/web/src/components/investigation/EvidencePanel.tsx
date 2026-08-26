import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { SeverityBadge, StatusText } from "@/components/common";
import { formatConfidence, formatDateTime } from "@/lib/event-copy";
import { INVESTIGATOR_LABEL } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import type { Finding, InvestigatorKind } from "@/types/api";

const ORDER: InvestigatorKind[] = ["BLOCKCHAIN", "TREASURY", "APPLICATION", "CODE"];

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const label = INVESTIGATOR_LABEL[finding.investigator.toLowerCase()] ?? finding.investigator;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold">{label}</span>
            <StatusText status={finding.status} />
            {finding.status === "SUCCESS" ? (
              <span className="font-mono text-[11px] text-primary">
                {formatConfidence(finding.confidence)}
              </span>
            ) : null}
            <SeverityBadge severity={finding.severity} className="ml-auto" />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{finding.summary}</p>
        </div>
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-3 text-xs leading-relaxed text-foreground/80">{finding.summary}</p>
          <ul className="space-y-2">
            {finding.evidence.map((ev, i) => (
              <li key={i} className="rounded-md border border-border/70 bg-background/60 p-3">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-foreground/80">
                    {ev.type}
                  </span>
                  <span className="truncate">{ev.source}</span>
                  <span className="ml-auto">{formatDateTime(ev.timestamp)}</span>
                </div>
                <p className="mt-1.5 text-xs text-foreground/90">{ev.observation}</p>
                {ev.reference ? (
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {ev.reference}
                  </p>
                ) : null}
              </li>
            ))}
            {finding.evidence.length === 0 ? (
              <li className="text-xs text-muted-foreground">No evidence recorded.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function EvidencePanel({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Evidence will appear as investigators complete.
      </p>
    );
  }
  const sorted = [...findings].sort(
    (a, b) => ORDER.indexOf(a.investigator) - ORDER.indexOf(b.investigator),
  );
  return (
    <div className="space-y-2.5">
      {sorted.map((f, i) => (
        <FindingCard key={`${f.investigator}-${i}`} finding={f} />
      ))}
    </div>
  );
}
