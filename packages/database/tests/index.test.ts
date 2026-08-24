import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getHeroIncident } from "@aegis/simulator";
import { genId, nowIso, type AgentEvent } from "@aegis/shared";
import {
  appendAgentEvent,
  createDb,
  createIncident,
  createInvestigation,
  getActiveInvestigation,
  getAgentEvents,
  getIncident,
  listIncidents,
  runMigrations,
  truncateAll,
  type DbHandle,
} from "../src/index.js";

// Availability must be resolved at module-eval time so `it.skipIf` sees it.
let handle: DbHandle | null = null;
let available = false;
try {
  handle = createDb();
  await runMigrations(handle.db);
  available = true;
} catch (err) {
  console.warn(
    `[database tests] skipping — Postgres unavailable (${err instanceof Error ? err.message : err}). ` +
      `Start it with: docker compose up -d postgres`,
  );
}

afterAll(async () => {
  await handle?.close();
});

beforeEach(async () => {
  if (!available || !handle) return;
  await truncateAll(handle.db);
});

function freshIncident() {
  return { ...getHeroIncident(), id: genId("INC") };
}

describe("database repositories", () => {
  it.skipIf(!available)("creates and reads an incident", async () => {
    const inc = freshIncident();
    await createIncident(handle!.db, inc);
    const got = await getIncident(handle!.db, inc.id);
    expect(got?.id).toBe(inc.id);
    expect(got?.type).toBe("TREASURY_GAS_DEPLETION");
  });

  it.skipIf(!available)("lists incidents with filters + pagination", async () => {
    await createIncident(handle!.db, freshIncident());
    await createIncident(handle!.db, freshIncident());
    const page = await listIncidents(handle!.db, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    const crit = await listIncidents(handle!.db, { severity: "CRITICAL" });
    expect(crit.total).toBe(2);
  });

  it.skipIf(!available)(
    "enforces one active investigation per incident",
    async () => {
      const inc = freshIncident();
      await createIncident(handle!.db, inc);
      await createInvestigation(handle!.db, { incidentId: inc.id });
      await expect(
        createInvestigation(handle!.db, { incidentId: inc.id }),
      ).rejects.toBeTruthy();
      const active = await getActiveInvestigation(handle!.db, inc.id);
      expect(active).not.toBeNull();
    },
  );

  it.skipIf(!available)("appends and reads agent events by cursor", async () => {
    const inc = freshIncident();
    await createIncident(handle!.db, inc);
    const mk = (type: AgentEvent["type"]): AgentEvent => ({
      id: genId("evt"),
      incidentId: inc.id,
      timestamp: nowIso(),
      type,
      actor: "test",
      payload: {},
    });
    const s1 = await appendAgentEvent(handle!.db, mk("incident.created"));
    await appendAgentEvent(handle!.db, mk("investigation.started"));
    const all = await getAgentEvents(handle!.db, inc.id);
    expect(all).toHaveLength(2);
    const afterFirst = await getAgentEvents(handle!.db, inc.id, {
      afterSeq: s1,
    });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.type).toBe("investigation.started");
  });
});
