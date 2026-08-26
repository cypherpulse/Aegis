// Per-user data isolation with real auth (AUTH_REQUIRED=true). Set before any
// request so authRequired() (read at call time) returns true for this file.
process.env.SANDBOX_DRIVER = "subprocess";
process.env.AUTH_REQUIRED = "true";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createDb, runMigrations, truncateAll, type DbHandle } from "@aegis/database";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

let handle: DbHandle | null = null;
let app: FastifyInstance | null = null;
let available = false;
try {
  handle = createDb();
  await runMigrations(handle.db);
  app = (await buildApp({ db: handle })).app;
  available = true;
} catch (err) {
  console.warn(
    `[isolation tests] skipping — Postgres unavailable (${err instanceof Error ? err.message : err})`,
  );
}

afterAll(async () => {
  await app?.close();
  await handle?.close();
  delete process.env.AUTH_REQUIRED;
});
beforeEach(async () => {
  if (available && handle) await truncateAll(handle.db);
});

async function login(): Promise<string> {
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
  return (Array.isArray(raw) ? raw[0] : raw)!.split(";")[0]!;
}

async function reportForProtocol(cookie: string): Promise<{ protocolId: string; incidentId: string }> {
  const protocolId = (
    await app!.inject({
      method: "POST",
      url: "/api/v1/protocols",
      headers: { cookie },
      payload: { name: `P-${Date.now()}-${Math.random()}` },
    })
  ).json().data.id as string;
  const incidentId = (
    await app!.inject({
      method: "POST",
      url: `/api/v1/protocols/${protocolId}/incidents`,
      headers: { cookie },
      payload: { title: "Payout failure", description: "Balance low", chain: "Ethereum" },
    })
  ).json().data.incidentId as string;
  return { protocolId, incidentId };
}

describe("Per-user incident isolation (AUTH_REQUIRED=true)", () => {
  it.skipIf(!available)("a user only sees their own incidents", async () => {
    const a = await login();
    const b = await login();

    const { incidentId: aIncident } = await reportForProtocol(a);
    // A also runs a demo incident (attributed to A via session).
    const aDemo = (
      await app!.inject({ method: "POST", url: "/api/v1/incidents", headers: { cookie: a }, payload: {} })
    ).json().data.incidentId as string;

    const { incidentId: bIncident } = await reportForProtocol(b);

    const aList = (await app!.inject({ url: "/api/v1/incidents", headers: { cookie: a } })).json().data;
    const aIds = aList.items.map((i: { id: string }) => i.id);
    expect(aIds).toContain(aIncident);
    expect(aIds).toContain(aDemo);
    expect(aIds).not.toContain(bIncident);

    const bList = (await app!.inject({ url: "/api/v1/incidents", headers: { cookie: b } })).json().data;
    const bIds = bList.items.map((i: { id: string }) => i.id);
    expect(bIds).toContain(bIncident);
    expect(bIds).not.toContain(aIncident);
    expect(bIds).not.toContain(aDemo);
  });

  it.skipIf(!available)("a user cannot read another user's incident by id (404)", async () => {
    const a = await login();
    const b = await login();
    const { incidentId } = await reportForProtocol(a);

    const asB = await app!.inject({ url: `/api/v1/incidents/${incidentId}`, headers: { cookie: b } });
    expect(asB.statusCode).toBe(404);

    const asA = await app!.inject({ url: `/api/v1/incidents/${incidentId}`, headers: { cookie: a } });
    expect(asA.statusCode).toBe(200);
  });

  it.skipIf(!available)("anonymous visitors see only the public demo pool", async () => {
    const a = await login();
    await reportForProtocol(a); // owned, not public

    // An anonymous demo incident (no session) → public pool.
    const publicId = (
      await app!.inject({ method: "POST", url: "/api/v1/incidents", payload: {} })
    ).json().data.incidentId as string;

    const anon = (await app!.inject({ url: "/api/v1/incidents" })).json().data;
    const ids = anon.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(publicId);
    // None of the owned incidents leak to anonymous.
    expect(anon.items.every((i: { id: string }) => i.id === publicId)).toBe(true);
  });
});
