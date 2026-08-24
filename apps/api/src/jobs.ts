import { DrizzleStore, type Database } from "@aegis/database";
import { runInvestigation } from "@aegis/incident-engine";
import type { Incident } from "@aegis/shared";
import type { EventPublisher } from "./events.js";

/**
 * In-process background runner (spec §10). Starts an investigation without
 * blocking the HTTP request and guarantees at most one active investigation per
 * incident in this process (the DB unique index is the durable guard). The
 * boundary is intentionally small so a durable queue can replace it later.
 */
export class InvestigationJobRunner {
  private readonly active = new Set<string>();

  constructor(
    private readonly db: Database,
    private readonly publisher: EventPublisher,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  isActive(incidentId: string): boolean {
    return this.active.has(incidentId);
  }

  /** Fire-and-forget: the investigation runs in the background. */
  enqueue(incident: Incident, investigationId: string): void {
    if (this.active.has(incident.id)) return;
    this.active.add(incident.id);
    const store = new DrizzleStore(this.db, investigationId, incident.id);

    void runInvestigation(incident, {
      store,
      onEvent: (e) => this.publisher.publish(e, investigationId),
    })
      .catch((err) => this.onError(err))
      .finally(() => this.active.delete(incident.id));
  }

  /** Await the current in-flight run for an incident (tests only). */
  async waitFor(incidentId: string, timeoutMs = 25000): Promise<void> {
    const start = Date.now();
    while (this.active.has(incidentId)) {
      if (Date.now() - start > timeoutMs) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
