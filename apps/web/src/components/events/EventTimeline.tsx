import { useEffect, useRef, useState } from "react";

import { describeEvent, formatTime } from "@/lib/event-copy";
import { cn } from "@/lib/utils";
import type { AgentEventType, StoredEvent } from "@/types/events";

function typeTone(type: AgentEventType): string {
  if (type.endsWith(".failed") || type.endsWith(".timeout") || type === "approval.denied")
    return "text-destructive";
  if (type.endsWith(".completed") || type === "investigation.completed") return "text-success";
  if (type.startsWith("approval.")) return "text-warning";
  if (
    type.endsWith(".started") ||
    type.endsWith(".tool_called") ||
    type.endsWith(".fusion_started")
  )
    return "text-primary";
  return "text-muted-foreground";
}

export function EventTimeline({ events }: { events: StoredEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, pinned]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-display text-sm font-semibold">Live timeline</span>
        <span className="font-mono text-[11px] text-muted-foreground">{events.length} events</span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Waiting for events…</p>
        ) : (
          <ol className="space-y-2.5">
            {events.map((event) => (
              <li key={event.seq} className="grid grid-cols-[auto_1fr] gap-3">
                <span className="mt-px font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {formatTime(event.timestamp)}
                </span>
                <div className="min-w-0">
                  <span className={cn("font-mono text-[11px] font-medium", typeTone(event.type))}>
                    {event.type}
                  </span>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {describeEvent(event)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      {!pinned ? (
        <button
          onClick={() => setPinned(true)}
          className="border-t border-border py-2 text-center font-mono text-[11px] text-primary hover:bg-primary/5"
        >
          ↓ Jump to latest
        </button>
      ) : null}
    </div>
  );
}
