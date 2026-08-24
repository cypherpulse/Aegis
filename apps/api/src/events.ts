import { appendAgentEvent, type Database, type StoredEvent } from "@aegis/database";
import type { AgentEvent } from "@aegis/shared";

export type EventSubscriber = (event: StoredEvent) => void;

/**
 * Persist-then-publish event bus (spec §24). Events are appended to Postgres in
 * order (a per-incident promise chain preserves ordering) and then fanned out to
 * SSE subscribers for that incident only — no cross-incident leakage.
 */
export class EventPublisher {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly subscribers = new Map<string, Set<EventSubscriber>>();

  constructor(
    private readonly db: Database,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  publish(event: AgentEvent, investigationId?: string | null): void {
    const prev = this.chains.get(event.incidentId) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        const seq = await appendAgentEvent(this.db, event, investigationId);
        const stored: StoredEvent = { ...event, seq };
        for (const cb of this.subscribers.get(event.incidentId) ?? []) {
          try {
            cb(stored);
          } catch (err) {
            this.onError(err);
          }
        }
      })
      .catch((err) => this.onError(err));
    this.chains.set(event.incidentId, next);
  }

  subscribe(incidentId: string, cb: EventSubscriber): () => void {
    let set = this.subscribers.get(incidentId);
    if (!set) {
      set = new Set();
      this.subscribers.set(incidentId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.subscribers.delete(incidentId);
    };
  }

  /** Wait for all pending writes for an incident (used by tests). */
  async drain(incidentId: string): Promise<void> {
    await (this.chains.get(incidentId) ?? Promise.resolve());
  }
}
