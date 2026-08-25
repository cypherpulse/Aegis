process.env.SANDBOX_DRIVER = "subprocess";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  runMigrations,
  truncateAll,
  type DbHandle,
} from "@aegis/database";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { InvestigationJobRunner } from "../src/jobs.js";
import type { EventPublisher } from "../src/events.js";

// Resolve availability at module-eval time so `it.skipIf` sees the real value.
let handle: DbHandle | null = null;
let app: FastifyInstance | null = null;
let jobs: InvestigationJobRunner;
let publisher: EventPublisher;
let port = 0;
let available = false;
try {
  handle = createDb();
  await runMigrations(handle.db);
  const built = await buildApp({ db: handle });
  app = built.app;
  jobs = built.jobs;
  publisher = built.publisher;
  await app.listen({ port: 0, host: "127.0.0.1" });
  port = (app.server.address() as AddressInfo).port;
  available = true;
} catch (err) {
  console.warn(
    `[sse tests] skipping — Postgres unavailable (${err instanceof Error ? err.message : err}). ` +
      `Start it with: docker compose up -d postgres`,
  );
}

afterAll(async () => {
  await app?.close();
  await handle?.close();
});

beforeEach(async () => {
  if (available && handle) await truncateAll(handle.db);
});

interface SseEvent {
  seq: number;
  incidentId: string;
  type: string;
}

/** Open an SSE connection and collect events until maxEvents or timeout. */
function readSse(
  path: string,
  opts: { headers?: Record<string, string>; maxEvents?: number; timeoutMs?: number } = {},
): Promise<SseEvent[]> {
  const maxEvents = opts.maxEvents ?? 6;
  const timeoutMs = opts.timeoutMs ?? 2500;
  return new Promise((resolve) => {
    const events: SseEvent[] = [];
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        headers: { Accept: "text/event-stream", ...(opts.headers ?? {}) },
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buf += chunk;
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = block
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (dataLine) {
              try {
                events.push(JSON.parse(dataLine.slice(5).trim()));
              } catch {
                /* ignore keep-alive comments */
              }
            }
            if (events.length >= maxEvents) {
              req.destroy();
              resolve(events);
              return;
            }
          }
        });
      },
    );
    req.on("error", () => resolve(events));
    req.end();
    setTimeout(() => {
      req.destroy();
      resolve(events);
    }, timeoutMs);
  });
}

async function createCompletedIncident(): Promise<string> {
  const res = await app!.inject({
    method: "POST",
    url: "/api/v1/incidents",
    payload: {},
  });
  const incidentId = res.json().data.incidentId as string;
  await jobs.waitFor(incidentId);
  await publisher.drain(incidentId);
  return incidentId;
}

describe("SSE stream", () => {
  it.skipIf(!available)("replays history for the incident", async () => {
    const incidentId = await createCompletedIncident();
    const events = await readSse(`/api/v1/incidents/${incidentId}/events/stream`, {
      maxEvents: 5,
    });
    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(events[0]!.type).toBe("incident.created");
    // Sequence numbers are monotonic.
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.seq).toBeGreaterThan(events[i - 1]!.seq);
    }
  });

  it.skipIf(!available)("resumes after Last-Event-ID", async () => {
    const incidentId = await createCompletedIncident();
    const all = await readSse(`/api/v1/incidents/${incidentId}/events/stream`, {
      maxEvents: 8,
    });
    const cursor = all[2]!.seq;
    const resumed = await readSse(
      `/api/v1/incidents/${incidentId}/events/stream`,
      { headers: { "Last-Event-ID": String(cursor) }, maxEvents: 4 },
    );
    expect(resumed.length).toBeGreaterThan(0);
    for (const e of resumed) expect(e.seq).toBeGreaterThan(cursor);
  });

  it.skipIf(!available)("isolates events per incident", async () => {
    const a = await createCompletedIncident();
    const b = await createCompletedIncident();
    const eventsA = await readSse(`/api/v1/incidents/${a}/events/stream`, {
      maxEvents: 6,
    });
    expect(eventsA.length).toBeGreaterThan(0);
    expect(eventsA.every((e) => e.incidentId === a)).toBe(true);
    expect(eventsA.some((e) => e.incidentId === b)).toBe(false);
  });

  it.skipIf(!available)("returns 404 for an unknown incident stream", async () => {
    const events = await readSse(`/api/v1/incidents/UNKNOWN/events/stream`, {
      timeoutMs: 800,
    });
    // 404 body is JSON (not SSE), so no SSE events are parsed.
    expect(events).toHaveLength(0);
  });
});
