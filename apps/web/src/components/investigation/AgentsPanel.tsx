import { StatusText } from "@/components/common";
import { useInvestigationFull, useTools } from "@/hooks/useInvestigationFull";
import { cn } from "@/lib/utils";

export function AgentsPanel({
  investigationId,
  live,
}: {
  investigationId: string | undefined;
  live: boolean;
}) {
  const full = useInvestigationFull(investigationId, live);
  const tools = useTools(investigationId, live);
  const agents = full.data?.agents ?? [];
  const toolRows = tools.data?.tools ?? [];

  if (agents.length === 0 && toolRows.length === 0) return null;

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card/40 p-5">
        <h2 className="mb-4 font-display text-sm font-semibold">Agents</h2>
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">{a.role}</span>
                <StatusText status={a.status} className="ml-auto" />
              </div>
              <div className="mt-1 flex gap-4 font-mono text-[11px] text-muted-foreground">
                <span>{a.toolCalls} tool calls</span>
                <span>{a.findings} findings</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-5">
        <h2 className="mb-4 font-display text-sm font-semibold">Tool activity</h2>
        <div className="max-h-[260px] space-y-1.5 overflow-y-auto">
          {toolRows.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md border border-border bg-background/50 px-3 py-1.5"
            >
              <span className="font-mono text-[11px] text-foreground">{t.toolName}</span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {t.agent}
              </span>
              <span
                className={cn(
                  "ml-auto font-mono text-[10px]",
                  t.status === "completed" ? "text-success" : "text-primary",
                )}
              >
                {t.status}
                {t.durationMs != null ? ` · ${t.durationMs}ms` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
