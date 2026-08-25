process.env.SANDBOX_DRIVER = "subprocess";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
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
    `[platform tests] skipping — Postgres unavailable (${err instanceof Error ? err.message : err}). Start it with: docker compose up -d postgres`,
  );
}

afterAll(async () => {
  await app?.close();
  await handle?.close();
});

beforeEach(async () => {
  if (available && handle) await truncateAll(handle.db);
});

async function login(): Promise<{ address: string; cookie: string; userId: string }> {
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address;
  const nonceRes = await app!.inject({
    method: "POST",
    url: "/api/v1/auth/wallet/nonce",
    payload: { address },
  });
  const { message } = nonceRes.json().data;
  const signature = await account.signMessage({ message });
  const verifyRes = await app!.inject({
    method: "POST",
    url: "/api/v1/auth/wallet/verify",
    payload: { address, signature },
  });
  const raw = verifyRes.headers["set-cookie"];
  const cookie = (Array.isArray(raw) ? raw[0] : raw)!.split(";")[0]!;
  return { address, cookie, userId: verifyRes.json().data.user.id };
}

function authed(cookie: string) {
  return { headers: { cookie } };
}

async function createProtocol(cookie: string, name = "Aegis Demo Protocol") {
  const res = await app!.inject({
    method: "POST",
    url: "/api/v1/protocols",
    headers: { cookie },
    payload: { name },
  });
  return res;
}

describe("Auth — wallet", () => {
  it.skipIf(!available)("nonce → signed message → session", async () => {
    const { cookie, address } = await login();
    const me = await app!.inject({ url: "/api/v1/auth/me", ...authed(cookie) });
    expect(me.json().data.user.walletAddress).toBe(address.toLowerCase());
  });

  it.skipIf(!available)("rejects a bad signature", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    await app!.inject({
      method: "POST",
      url: "/api/v1/auth/wallet/nonce",
      payload: { address: account.address },
    });
    const res = await app!.inject({
      method: "POST",
      url: "/api/v1/auth/wallet/verify",
      payload: { address: account.address, signature: "0xdeadbeef" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("Protocols + resources", () => {
  it.skipIf(!available)("CRUD + slug conflict", async () => {
    const { cookie } = await login();
    const created = await createProtocol(cookie);
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;

    const conflict = await createProtocol(cookie);
    expect(conflict.statusCode).toBe(409);

    const got = await app!.inject({ url: `/api/v1/protocols/${id}`, ...authed(cookie) });
    expect(got.json().data.name).toBe("Aegis Demo Protocol");

    const patched = await app!.inject({
      method: "PATCH",
      url: `/api/v1/protocols/${id}`,
      ...authed(cookie),
      payload: { description: "Updated" },
    });
    expect(patched.json().data.description).toBe("Updated");

    const del = await app!.inject({ method: "DELETE", url: `/api/v1/protocols/${id}`, ...authed(cookie) });
    expect(del.statusCode).toBe(204);
  });

  it.skipIf(!available)("enforces protocol ownership (403)", async () => {
    const a = await login();
    const b = await login();
    const id = (await createProtocol(a.cookie)).json().data.id as string;
    const asB = await app!.inject({ url: `/api/v1/protocols/${id}`, ...authed(b.cookie) });
    expect(asB.statusCode).toBe(403);
  });

  it.skipIf(!available)("contracts: validates address + CRUD", async () => {
    const { cookie } = await login();
    const id = (await createProtocol(cookie)).json().data.id as string;

    const bad = await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${id}/contracts`,
      ...authed(cookie),
      payload: { name: "Vault", chain: "Base Sepolia", address: "not-an-address" },
    });
    expect(bad.statusCode).toBe(422);

    const good = await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${id}/contracts`,
      ...authed(cookie),
      payload: {
        name: "Vault",
        chain: "Base Sepolia",
        address: "0x1111111111111111111111111111111111111111",
      },
    });
    expect(good.statusCode).toBe(201);

    const list = await app!.inject({ url: `/api/v1/protocols/${id}/contracts`, ...authed(cookie) });
    expect(list.json().data.items).toHaveLength(1);
  });

  it.skipIf(!available)("treasury + monitoring", async () => {
    const { cookie } = await login();
    const id = (await createProtocol(cookie)).json().data.id as string;
    const t = await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${id}/treasury`,
      ...authed(cookie),
      payload: { address: "0x2222222222222222222222222222222222222222", chain: "Base Sepolia", label: "Main" },
    });
    expect(t.statusCode).toBe(201);

    const mon = await app!.inject({ url: `/api/v1/protocols/${id}/monitoring`, ...authed(cookie) });
    expect(mon.json().data.treasuryMonitoring).toBe(false);
    const patched = await app!.inject({
      method: "PATCH",
      url: `/api/v1/protocols/${id}/monitoring`,
      ...authed(cookie),
      payload: { treasuryMonitoring: true },
    });
    expect(patched.json().data.treasuryMonitoring).toBe(true);
  });
});

describe("Integration keys + ingestion", () => {
  it.skipIf(!available)("shows secret once, hides it after, and ingests via x-api-key", async () => {
    const { cookie } = await login();
    const id = (await createProtocol(cookie)).json().data.id as string;

    const created = await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${id}/integration-keys`,
      ...authed(cookie),
      payload: { name: "CI" },
    });
    expect(created.statusCode).toBe(201);
    const secret = created.json().data.secret as string;
    expect(secret.startsWith("aegis_")).toBe(true);

    const list = await app!.inject({ url: `/api/v1/protocols/${id}/integration-keys`, ...authed(cookie) });
    expect(list.json().data.items[0].secret).toBeUndefined();
    const keyId = list.json().data.items[0].id as string;

    const ingest = await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${id}/incidents`,
      headers: { "x-api-key": secret },
      payload: { title: "Payout failures", description: "Treasury low", chain: "Base Sepolia" },
    });
    expect(ingest.statusCode).toBe(201);
    expect(ingest.json().data.status).toBe("DETECTED");

    // Revoke → key no longer works.
    await app!.inject({
      method: "DELETE",
      url: `/api/v1/protocols/${id}/integration-keys/${keyId}`,
      ...authed(cookie),
    });
    const blocked = await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${id}/incidents`,
      headers: { "x-api-key": secret },
      payload: { title: "x", description: "y", chain: "Base Sepolia" },
    });
    expect(blocked.statusCode).toBe(401);
  });
});

describe("E2E — user → protocol → contract → treasury → incident → investigation", () => {
  it.skipIf(!available)("runs the full chain end to end and persists it", async () => {
    const { cookie } = await login();
    const protocolId = (await createProtocol(cookie, "Chain Test Protocol")).json().data.id as string;

    await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${protocolId}/contracts`,
      ...authed(cookie),
      payload: { name: "Payout", chain: "Base Sepolia", address: "0x3333333333333333333333333333333333333333" },
    });
    await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${protocolId}/treasury`,
      ...authed(cookie),
      payload: { address: "0x4444444444444444444444444444444444444444", chain: "Base Sepolia" },
    });

    const ingest = await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${protocolId}/incidents`,
      ...authed(cookie),
      payload: { title: "Payouts failing", description: "Treasury gas depletion", severity: "CRITICAL", chain: "Base Sepolia" },
    });
    const incidentId = ingest.json().data.incidentId as string;

    const started = await app!.inject({ method: "POST", url: `/api/v1/incidents/${incidentId}/investigate` });
    expect(started.statusCode).toBe(202);
    const investigationId = started.json().data.investigationId as string;

    await jobs.waitFor(incidentId);
    await publisher.drain(incidentId);

    // The full pipeline (TrueForge/local → investigators → fusion → code → sandbox → root cause) ran and persisted.
    const inv = await app!.inject({ url: `/api/v1/investigations/${investigationId}/full` });
    const body = inv.json().data;
    expect(["COMPLETE", "PARTIAL"]).toContain(body.status);
    expect(body.agents.length).toBeGreaterThanOrEqual(3);
    expect(body.findings.length).toBeGreaterThanOrEqual(3);
    expect(body.rootCause).not.toBeNull();

    // Incident is scoped to the protocol.
    const scoped = await app!.inject({ url: `/api/v1/incidents?protocol=${protocolId}`, ...authed(cookie) });
    expect(scoped.json().data.items.some((i: { id: string }) => i.id === incidentId)).toBe(true);
  });
});

describe("Investigation sub-resources (real persisted state)", () => {
  it.skipIf(!available)(
    "exposes agents, tools, evidence, timeline for a completed investigation",
    async () => {
      const res = await app!.inject({ method: "POST", url: "/api/v1/incidents", payload: {} });
      const { incidentId, investigationId } = res.json().data;
      await jobs.waitFor(incidentId);
      await publisher.drain(incidentId);

      const agents = await app!.inject({ url: `/api/v1/investigations/${investigationId}/agents` });
      expect(agents.json().data.agents.length).toBeGreaterThanOrEqual(3);
      expect(agents.json().data.agents.some((a: { toolCalls: number }) => a.toolCalls > 0)).toBe(true);

      const tools = await app!.inject({ url: `/api/v1/investigations/${investigationId}/tools` });
      expect(tools.json().data.tools.length).toBeGreaterThan(0);

      const evidence = await app!.inject({ url: `/api/v1/investigations/${investigationId}/evidence` });
      expect(evidence.json().data.evidence.length).toBeGreaterThan(0);

      const timeline = await app!.inject({ url: `/api/v1/investigations/${investigationId}/timeline` });
      expect(timeline.json().data.timeline.length).toBeGreaterThan(5);
    },
  );
});
