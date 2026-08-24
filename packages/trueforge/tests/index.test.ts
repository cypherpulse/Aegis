import { describe, expect, it } from "vitest";
import { ApprovalError, type AgentEvent } from "@aegis/shared";
import {
  ApprovalController,
  AUTO_APPROVAL_POLICY,
  TrueForgeSession,
  type ApprovalRequest,
} from "../src/index.js";

const baseReq: ApprovalRequest = {
  incidentId: "INC-001",
  investigator: "TREASURY",
  actor: "treasury-investigator",
  tool: "getTreasuryBalance",
  reason: "read privileged treasury state",
};

function collector() {
  const events: AgentEvent[] = [];
  return { events, emit: (e: AgentEvent) => events.push(e) };
}

describe("ApprovalController", () => {
  it("auto-approves and emits requested + granted", async () => {
    const c = collector();
    const ctrl = new ApprovalController(AUTO_APPROVAL_POLICY, c.emit);
    await ctrl.requestApproval(baseReq);
    expect(c.events.map((e) => e.type)).toEqual([
      "approval.requested",
      "approval.granted",
    ]);
  });

  it("manual approval grants when the resolver approves", async () => {
    const c = collector();
    const ctrl = new ApprovalController(
      { mode: "manual", timeoutMs: 1000, resolver: async () => true },
      c.emit,
    );
    await ctrl.requestApproval(baseReq);
    expect(c.events.at(-1)?.type).toBe("approval.granted");
  });

  it("manual denial throws ApprovalError and emits approval.denied", async () => {
    const c = collector();
    const ctrl = new ApprovalController(
      { mode: "manual", timeoutMs: 1000, resolver: async () => false },
      c.emit,
    );
    await expect(ctrl.requestApproval(baseReq)).rejects.toBeInstanceOf(
      ApprovalError,
    );
    expect(c.events.at(-1)?.type).toBe("approval.denied");
  });

  it("times out a slow critical approval and blocks", async () => {
    const c = collector();
    const ctrl = new ApprovalController(
      {
        mode: "manual",
        timeoutMs: 20,
        resolver: () => new Promise<boolean>(() => {}), // never settles
      },
      c.emit,
    );
    await expect(ctrl.requestApproval(baseReq)).rejects.toBeInstanceOf(
      ApprovalError,
    );
    expect(c.events.at(-1)?.type).toBe("approval.timeout");
  });
});

describe("TrueForgeSession", () => {
  it("starts in local mode with no credentials and emits session.created", async () => {
    const c = collector();
    const session = await TrueForgeSession.start({
      incidentId: "INC-001",
      emit: c.emit,
      config: null,
    });
    expect(session.mode).toBe("local");
    expect(session.sessionId).toMatch(/^sess_/);
    expect(c.events.some((e) => e.type === "session.created")).toBe(true);
  });

  it("local narrateTurn is a no-op", async () => {
    const c = collector();
    const session = await TrueForgeSession.start({
      incidentId: "INC-001",
      emit: c.emit,
      config: null,
    });
    expect(await session.narrateTurn("hi")).toBeUndefined();
  });
});

// Real TrueForge smoke test — only runs when credentials are present. A mocked
// run is never passed off as a real integration test (spec §23).
const hasCreds = !!(
  process.env.TRUEFORGE_API_URL && process.env.TRUEFORGE_API_KEY
);

describe("TrueForge real smoke test", () => {
  it.skipIf(!hasCreds)("creates a real harness session", async () => {
    const c = collector();
    const session = await TrueForgeSession.start({
      incidentId: "INC-SMOKE",
      emit: c.emit,
    });
    expect(session.mode).toBe("harness");
    expect(session.sessionId).toBeTruthy();
  });
});
