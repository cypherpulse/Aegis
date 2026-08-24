import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@aegis/shared";
import { SimulatorProvider, type BlockchainProvider } from "@aegis/blockchain";
import { createToolRegistry } from "@aegis/mcp";
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
  runCommander,
  runTreasuryInvestigator,
  type InvestigationContext,
} from "../src/index.js";

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
