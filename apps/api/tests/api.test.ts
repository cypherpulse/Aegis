process.env.SANDBOX_DRIVER = "subprocess";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  createIncident,
  createInvestigation,
  runMigrations,
  truncateAll,
  type DbHandle,
  type StoredEvent,
} from "@aegis/database";
import { genId, type AgentEvent } from "@aegis/shared";
import { getHeroIncident } from "@aegis/simulator";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { EventPublisher } from "../src/events.js";
import type { InvestigationJobRunner } from "../src/jobs.js";

// Resolve availability at module-eval time so `it.skipIf` sees the real value.
let handle: DbHandle | null = null;
let app: FastifyInstance | null = null;
let jobs: InvestigationJobRunner;
let publisher: EventPublisher;
let available = false;
try {
  handle = createDb();
  await runMigrations(handle.db);
  const built = await buildApp({ db: handle });
  app = built.app;
  jobs = built.jobs;
  publisher = built.publisher;
  available = true;
} catch (err) {
  console.warn(
    `[api tests] skipping — Postgres unavailable (${err instanceof Error ? err.message : err}). ` +
      `Start it with: docker compose up -d postgres`,
  );
}

afterAll(async () => {
  await app?.close();
  await handle?.close();
});

beforeEach(async () => {
  if (!available || !handle) return;
  await truncateAll(handle.db);
});

describe("Aegis API", () => {
  it.skipIf(!available)("health + ready + openapi", async () => {
    expect((await app!.inject({ url: "/health" })).statusCode).toBe(200);
    const ready = await app!.inject({ url: "/ready" });
    expect(ready.json().data.db).toBe(true);
    const openapi = await app!.inject({ url: "/api/openapi.json" });
    expect(openapi.json().openapi).toBeTruthy();
    expect(openapi.json().paths["/api/v1/incidents"]).toBeTruthy();
  });

  it.skipIf(!available)(
    "POST creates + investigates + persists a root cause",
    async () => {
      const res = await app!.inject({
        method: "POST",
        url: "/api/v1/incidents",
        payload: {},
      });
      expect(res.statusCode).toBe(202);
      const { incidentId, investigationId, status } = res.json().data;
      expect(status).toBe("QUEUED");

      await jobs.waitFor(incidentId);
      await publisher.drain(incidentId);

      const got = await app!.inject({ url: `/api/v1/incidents/${incidentId}` });
      const body = got.json().data;
      expect(body.incident.id).toBe(incidentId);
      expect(body.findings.length).toBe(4);
      expect(body.rootCause?.status).toBe("COMPLETE");
      expect(body.rootCause?.title).toContain("Treasury gas depletion");

      const rc = await app!.inject({
        url: `/api/v1/investigations/${investigationId}/root-cause`,
      });
      expect(rc.json().data.rootCause.confidence).toBeGreaterThan(0.9);

      const events = await app!.inject({
        url: `/api/v1/incidents/${incidentId}/events`,
      });
      expect(events.json().data.items.length).toBeGreaterThan(10);
    },
  );

  it.skipIf(!available)("investigate is idempotent for an active run", async () => {
    const inc = { ...getHeroIncident(), id: genId("INC") };
    await createIncident(handle!.db, inc);
    const first = await createInvestigation(handle!.db, { incidentId: inc.id });
    const res = await app!.inject({
      method: "POST",
      url: `/api/v1/incidents/${inc.id}/investigate`,
    });
    expect(res.json().data.investigationId).toBe(first.id);
  });

  it.skipIf(!available)("returns 400 with field errors on bad input", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/incidents",
      payload: { severity: "SPICY" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it.skipIf(!available)("SSE publisher isolates events per incident", async () => {
    const a: StoredEvent[] = [];
    const b: StoredEvent[] = [];
    const unsubA = publisher.subscribe("INC-A", (e) => a.push(e));
    const unsubB = publisher.subscribe("INC-B", (e) => b.push(e));
    const mk = (incidentId: string): AgentEvent => ({
      id: genId("evt"),
      incidentId,
      timestamp: new Date().toISOString(),
      type: "incident.created",
      actor: "test",
      payload: {},
    });
    // These incidents must exist for the FK-free agent_events insert.
    publisher.publish(mk("INC-A"));
    publisher.publish(mk("INC-B"));
    await publisher.drain("INC-A");
    await publisher.drain("INC-B");
    unsubA();
    unsubB();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.incidentId).toBe("INC-A");
  });
});
