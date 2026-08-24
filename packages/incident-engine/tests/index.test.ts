// Force the subprocess sandbox for a fast, deterministic pipeline (Docker is
// exercised by the sandbox package's own suite).
process.env.SANDBOX_DRIVER = "subprocess";
import { describe, expect, it } from "vitest";
import {
  nowIso,
  type Evidence,
  type InvestigationFinding,
  type InvestigatorKind,
  type Severity,
} from "@aegis/shared";
import { getHeroIncident } from "@aegis/simulator";
import { fuseEvidence, runInvestigation } from "../src/index.js";

function ev(reference: string): Evidence {
  return {
    source: "test",
    type: "test",
    reference,
    observation: "obs",
    timestamp: nowIso(),
  };
}

function finding(
  investigator: InvestigatorKind,
  confidence: number,
  severity: Severity,
  metadata: Record<string, unknown>,
  status: "SUCCESS" | "FAILED" = "SUCCESS",
): InvestigationFinding {
  return {
    investigator,
    status,
    summary: `${investigator} summary`,
    evidence: status === "SUCCESS" ? [ev(`${investigator}-ref`)] : [],
    confidence,
    severity,
    timestamp: nowIso(),
    metadata,
  };
}

const heroFindings: InvestigationFinding[] = [
  finding("BLOCKCHAIN", 0.92, "CRITICAL", { insufficientCount: 4 }),
  finding("TREASURY", 0.96, "CRITICAL", { sufficient: false }),
  finding("APPLICATION", 0.85, "HIGH", {}),
];

describe("Evidence Fusion", () => {
  it("produces the treasury gas depletion hypothesis from correlated findings", () => {
    const unified = fuseEvidence("INC-001", heroFindings);
    expect(unified.status).toBe("COMPLETE");
    expect(unified.hypothesis.title).toBe("Treasury gas depletion");
    expect(unified.hypothesis.confidence).toBeGreaterThan(0.9);
    expect(unified.correlatedSignals.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves all original findings", () => {
    const unified = fuseEvidence("INC-001", heroFindings);
    expect(unified.findings).toHaveLength(3);
    expect(unified.findings).toEqual(heroFindings);
  });

  it("marks PARTIAL when an investigator failed", () => {
    const withFailure: InvestigationFinding[] = [
      heroFindings[0]!,
      heroFindings[1]!,
      finding("APPLICATION", 0, "LOW", {}, "FAILED"),
    ];
    const unified = fuseEvidence("INC-001", withFailure);
    expect(unified.status).toBe("PARTIAL");
  });

  it("is deterministic for identical input", () => {
    const a = fuseEvidence("INC-001", heroFindings);
    const b = fuseEvidence("INC-001", heroFindings);
    expect(a.hypothesis).toEqual(b.hypothesis);
    expect(a.correlatedSignals).toEqual(b.correlatedSignals);
  });
});

describe("runInvestigation (end-to-end)", () => {
  it("drives the hero incident to a complete gas-depletion result", async () => {
    const result = await runInvestigation(getHeroIncident(), {
      forceSimulator: true,
    });
    expect(result.incident.status).toBe("INVESTIGATION_COMPLETE");
    // 3 commander investigators + the Code Investigator.
    expect(result.findings).toHaveLength(4);
    expect(result.findings.some((f) => f.investigator === "CODE")).toBe(true);
    expect(result.failed).toHaveLength(0);
    expect(result.unifiedEvidence.hypothesis.title).toBe(
      "Treasury gas depletion",
    );
    expect(result.rootCause.status).toBe("COMPLETE");
    expect(result.rootCause.title).toContain("Treasury gas depletion");
    expect(result.rootCause.confidence).toBeGreaterThan(0.9);
    expect(result.rootCause.contributingFactors.length).toBeGreaterThanOrEqual(3);
    expect(result.sessionMode).toBe("local");
  });

  it("emits the full lifecycle event sequence", async () => {
    const seen: string[] = [];
    const result = await runInvestigation(getHeroIncident(), {
      forceSimulator: true,
      onEvent: (e) => seen.push(e.type),
    });
    for (const type of [
      "incident.created",
      "investigation.started",
      "session.created",
      "commander.started",
      "investigator.started",
      "investigator.tool_called",
      "approval.requested",
      "approval.granted",
      "evidence.fusion_started",
      "evidence.fusion_completed",
      "code_investigator.started",
      "code_investigator.tool_called",
      "code_investigator.completed",
      "sandbox.completed",
      "root_cause.started",
      "root_cause.completed",
      "investigation.completed",
    ]) {
      expect(seen).toContain(type);
    }
    expect(result.events.length).toBeGreaterThan(10);
  });
});
