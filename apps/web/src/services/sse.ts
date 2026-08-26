// SSE abstraction for the incident event stream (§V).

import { streamUrl } from "./api";
import type { StoredEvent } from "@/types/events";

export type SseConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export function parseStoredEvent(raw: string): StoredEvent | null {
  if (!raw || raw.startsWith(":")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Partial<StoredEvent>;
  if (
    typeof candidate.seq !== "number" ||
    typeof candidate.id !== "string" ||
    typeof candidate.type !== "string" ||
    typeof candidate.incidentId !== "string" ||
    typeof candidate.timestamp !== "string"
  ) {
    return null;
  }
  return {
    seq: candidate.seq,
    id: candidate.id,
    incidentId: candidate.incidentId,
    timestamp: candidate.timestamp,
    type: candidate.type,
    actor: typeof candidate.actor === "string" ? candidate.actor : "system",
    payload:
      typeof candidate.payload === "object" && candidate.payload !== null
        ? (candidate.payload as Record<string, unknown>)
        : {},
  };
}

export interface SseHandlers {
  onEvent: (event: StoredEvent) => void;
  onState: (state: SseConnectionState) => void;
}

/** Opens a single EventSource for an incident. De-duping by seq is the caller's job. */
export function openIncidentStream(incidentId: string, handlers: SseHandlers): () => void {
  if (typeof EventSource === "undefined") return () => {};

  let closed = false;
  handlers.onState("connecting");
  const es = new EventSource(streamUrl(incidentId));
  let everOpen = false;

  es.onopen = () => {
    everOpen = true;
    if (!closed) handlers.onState("open");
  };

  es.onmessage = (message: MessageEvent<string>) => {
    const event = parseStoredEvent(message.data);
    if (event) handlers.onEvent(event);
  };

  es.onerror = () => {
    if (closed) return;
    handlers.onState(es.readyState === EventSource.CLOSED && !everOpen ? "closed" : "reconnecting");
  };

  return () => {
    closed = true;
    es.close();
    handlers.onState("closed");
  };
}
