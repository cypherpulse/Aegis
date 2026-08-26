import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { aegisApi } from "@/services/api";
import { openIncidentStream, type SseConnectionState } from "@/services/sse";
import { mergeEvents, reduceEvents, type PipelineState } from "@/lib/pipeline";
import type { StoredEvent } from "@/types/events";

const RELEASE_INTERVAL_MS = 110;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface UseIncidentEvents {
  events: StoredEvent[];
  pipeline: PipelineState;
  connection: SseConnectionState;
  historyError: string | null;
  pendingCount: number;
  reconnect: () => void;
}

/**
 * Single SSE abstraction for one incident: REST replay -> live stream,
 * de-duped by seq, released at a legible pace.
 */
export function useIncidentEvents(incidentId: string | undefined): UseIncidentEvents {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [connection, setConnection] = useState<SseConnectionState>("connecting");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [nonce, setNonce] = useState(0);

  const queueRef = useRef<StoredEvent[]>([]);
  const seenRef = useRef<Set<number>>(new Set());

  const enqueue = useCallback((incoming: StoredEvent[]) => {
    const fresh = incoming.filter((event) => {
      if (seenRef.current.has(event.seq)) return false;
      seenRef.current.add(event.seq);
      return true;
    });
    if (fresh.length === 0) return;
    queueRef.current = [...queueRef.current, ...fresh].sort((a, b) => a.seq - b.seq);
    setPendingCount(queueRef.current.length);
  }, []);

  // Reset on incident change / manual reconnect.
  useEffect(() => {
    queueRef.current = [];
    seenRef.current = new Set();
    setEvents([]);
    setPendingCount(0);
    setHistoryError(null);
  }, [incidentId, nonce]);

  // REST history replay (refresh-safe rehydration).
  useEffect(() => {
    if (!incidentId) return;
    let cancelled = false;
    void (async () => {
      try {
        let afterSeq: number | undefined;
        for (let page = 0; page < 20; page += 1) {
          const params: { limit: number; afterSeq?: number } = { limit: 500 };
          if (afterSeq !== undefined) params.afterSeq = afterSeq;
          const response = await aegisApi.getEvents(incidentId, params);
          if (cancelled) return;
          if (response.items.length === 0) break;
          enqueue(response.items);
          afterSeq = response.items[response.items.length - 1]?.seq;
          if (!response.nextCursor) break;
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : "Failed to load event history.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incidentId, enqueue, nonce]);

  // Live stream.
  useEffect(() => {
    if (!incidentId) return;
    const close = openIncidentStream(incidentId, {
      onEvent: (event) => enqueue([event]),
      onState: setConnection,
    });
    return close;
  }, [incidentId, enqueue, nonce]);

  // Paced release so the burst is legible.
  useEffect(() => {
    const instant = prefersReducedMotion();
    const timer = window.setInterval(
      () => {
        if (queueRef.current.length === 0) return;
        const batchSize = instant ? queueRef.current.length : queueRef.current.length > 24 ? 3 : 1;
        const batch = queueRef.current.slice(0, batchSize);
        queueRef.current = queueRef.current.slice(batchSize);
        setPendingCount(queueRef.current.length);
        setEvents((current) => mergeEvents(current, batch));
      },
      instant ? 16 : RELEASE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [incidentId, nonce]);

  const pipeline = useMemo(() => reduceEvents(events), [events]);

  const reconnect = useCallback(() => setNonce((n) => n + 1), []);

  return { events, pipeline, connection, historyError, pendingCount, reconnect };
}
