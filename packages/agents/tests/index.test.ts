import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgentEvent, InvestigationFinding } from "@aegis/shared";
import { SimulatorProvider, type BlockchainProvider } from "@aegis/blockchain";
import { createToolRegistry } from "@aegis/mcp";
import { SubprocessSandbox } from "@aegis/sandbox";
import { getHeroIncident } from "@aegis/simulator";
import {
  ApprovalController,
  AUTO_APPROVAL_POLICY,
  LocalAgentRunner,
  TrueForgeSession,
} from "@aegis/trueforge";
import {
  runApplicationInvestigator,
  runBlockchainInvestigator,
  runCodeInvestigator,
  runCommander,
  runTreasuryInvestigator,
  type InvestigationContext,
} from "../src/index.js";

const FIXTURE_ROOT = fileURLToPath(
  new URL("../../../fixtures/demo-app", import.meta.url),
);

async function makeCtx(provider: BlockchainProvider = new SimulatorProvider()) {
  const events: AgentEvent[] = [];
  const emit = (e: AgentEvent) => events.push(e);
  const session = await TrueForgeSession.start({
    incidentId: "INC-001",
    emit,
    config: null,
  });
  const ctx: InvestigationContext = {
    incident: getHeroIncident(),
    session,
    runner: new LocalAgentRunner(),
    registry: createToolRegistry(),
    toolCtx: { provider },
    approval: new ApprovalController(AUTO_APPROVAL_POLICY, emit),
    emit,
  };
  return { ctx, events };
}

function brokenProvider(): BlockchainProvider {
  const base = new SimulatorProvider();
  return Object.assign(base, {
    getRecentTransactions: async () => {
      throw new Error("rpc unavailable");
    },
  });
}

describe("Blockchain Investigator", () => {
  it("finds the reverted payout pattern (success)", async () => {
    const { ctx, events } = await makeCtx();
    const finding = await runBlockchainInvestigator(ctx);
    expect(finding.status).toBe("SUCCESS");
    expect(finding.severity).toBe("CRITICAL");
    expect(finding.confidence).toBeGreaterThan(0.8);
    expect(finding.evidence.length).toBeGreaterThan(0);
    expect(finding.metadata["revertedCount"]).toBe(4);
    expect(events.some((e) => e.type === "investigator.tool_called")).toBe(true);
  });

  it("returns a FAILED finding when a tool errors", async () => {
    const { ctx } = await makeCtx(brokenProvider());
    const finding = await runBlockchainInvestigator(ctx);
    expect(finding.status).toBe("FAILED");
    expect(finding.confidence).toBe(0);
  });
});

describe("Treasury Investigator", () => {
  it("detects the insufficient balance and passes the approval gate", async () => {
    const { ctx, events } = await makeCtx();
    const finding = await runTreasuryInvestigator(ctx);
    expect(finding.status).toBe("SUCCESS");
    expect(finding.severity).toBe("CRITICAL");
    expect(finding.confidence).toBeGreaterThanOrEqual(0.9);
    expect(events.map((e) => e.type)).toContain("approval.requested");
    expect(events.map((e) => e.type)).toContain("approval.granted");
  });
});

describe("Application Investigator", () => {
  it("confirms elevated payout failures from telemetry", async () => {
    const { ctx } = await makeCtx();
    const finding = await runApplicationInvestigator(ctx);
    expect(finding.status).toBe("SUCCESS");
    expect(
      finding.evidence.some((e) => e.type === "alert"),
    ).toBe(true);
  });
});

describe("Treasury Investigator — approval boundary", () => {
  it("blocks the sensitive tool on denial but still produces a finding", async () => {
    const { ctx, events } = await makeCtx();
    // A manual policy that rejects: the sensitive getTreasuryBalance is blocked.
    ctx.approval = new ApprovalController(
      { mode: "manual", timeoutMs: 1000, resolver: async () => false },
      ctx.emit,
    );
    const finding = await runTreasuryInvestigator(ctx);
    // The investigation continues on partial data — it does not crash.
    expect(finding.status).toBe("SUCCESS");
    expect(finding.metadata["balanceBlocked"]).toBe(true);
    const types = events.map((e) => e.type);
    expect(types).toContain("approval.requested");
    expect(types).toContain("approval.denied");
  });
});

describe("Code Investigator", () => {
  it("discovers the code bug and validates it in the sandbox", async () => {
    const { ctx, events } = await makeCtx();
    ctx.toolCtx = { ...ctx.toolCtx, codeRoot: FIXTURE_ROOT };
    ctx.sandbox = new SubprocessSandbox();

    const prior: InvestigationFinding[] = [
      {
        investigator: "TREASURY",
        status: "SUCCESS",
        summary: "insufficient",
        evidence: [
          {
            source: "treasury",
            type: "balance",
            reference: "0xT",
            observation: "low",
            timestamp: new Date().toISOString(),
          },
        ],
        confidence: 0.96,
        severity: "CRITICAL",
        timestamp: new Date().toISOString(),
        metadata: { sufficient: false },
      },
      {
        investigator: "APPLICATION",
        status: "SUCCESS",
        summary: "retries",
        evidence: [
          {
            source: "metrics",
            type: "metric",
            reference: "payout_retry_count",
            observation: "27",
            timestamp: new Date().toISOString(),
          },
        ],
        confidence: 0.85,
        severity: "HIGH",
        timestamp: new Date().toISOString(),
        metadata: { retries: 27 },
      },
    ];

    const finding = await runCodeInvestigator(ctx, prior);
    expect(finding.investigator).toBe("CODE");
    expect(finding.status).toBe("SUCCESS");
    expect(finding.metadata["drains"]).toBe(true);
    expect(finding.evidence.some((e) => e.type === "source")).toBe(true);
    expect(finding.evidence.some((e) => e.type === "analysis")).toBe(true);
    const types = events.map((e) => e.type);
    expect(types).toContain("code_investigator.started");
    expect(types).toContain("sandbox.completed");
    expect(types).toContain("code_investigator.completed");
  }, 30000);

  it("fails gracefully when the code root is missing", async () => {
    // makeCtx's toolCtx has no codeRoot, so the code tools cannot run.
    const { ctx } = await makeCtx();
    ctx.sandbox = new SubprocessSandbox();
    const finding = await runCodeInvestigator(ctx, []);
    expect(finding.status).toBe("FAILED");
  });
});

describe("Incident Commander", () => {
  it("runs all three investigators and collects findings", async () => {
    const { ctx } = await makeCtx();
    const result = await runCommander(ctx);
    expect(result.findings).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(result.findings.every((f) => f.status === "SUCCESS")).toBe(true);
  });

  it("isolates a single investigator failure (partial)", async () => {
    const { ctx } = await makeCtx(brokenProvider());
    const result = await runCommander(ctx);
    expect(result.findings).toHaveLength(3);
    expect(result.failed).toContain("BLOCKCHAIN");
    // Treasury and Application still succeed.
    const ok = result.findings.filter((f) => f.status === "SUCCESS");
    expect(ok.length).toBe(2);
  });
});
