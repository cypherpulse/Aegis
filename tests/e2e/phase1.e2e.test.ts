process.env.SANDBOX_DRIVER = "subprocess";
import { describe, expect, it } from "vitest";
import { getHeroIncident } from "@aegis/simulator";
import { runInvestigation } from "@aegis/incident-engine";

/**
 * End-to-end Phase 1 vertical slice: incident → TrueForge session → commander →
 * three investigators → evidence fusion → unified result. Runs fully offline via
 * the deterministic local runtime.
 */
describe("Phase 1 vertical slice (e2e)", () => {
  it("investigates the hero incident end-to-end", async () => {
    const result = await runInvestigation(getHeroIncident(), {
      forceSimulator: true,
    });

    expect(result.incident.status).toBe("INVESTIGATION_COMPLETE");
    expect(result.findings).toHaveLength(4);
    expect(result.findings.every((f) => f.status === "SUCCESS")).toBe(true);
    expect(result.rootCause.status).toBe("COMPLETE");
    expect(result.rootCause.title).toContain("Treasury gas depletion");

    const u = result.unifiedEvidence;
    expect(u.status).toBe("COMPLETE");
    expect(u.hypothesis.title).toBe("Treasury gas depletion");
    expect(u.hypothesis.confidence).toBeGreaterThan(0.9);
    expect(u.correlatedSignals.length).toBeGreaterThanOrEqual(2);

    // The human-in-the-loop approval gate fired for the sensitive tool.
    const types = result.events.map((e) => e.type);
    expect(types).toContain("approval.requested");
    expect(types).toContain("approval.granted");
  });

  it("is deterministic across runs", async () => {
    const a = await runInvestigation(getHeroIncident(), { forceSimulator: true });
    const b = await runInvestigation(getHeroIncident(), { forceSimulator: true });
    expect(a.unifiedEvidence.hypothesis).toEqual(b.unifiedEvidence.hypothesis);
    expect(a.findings.map((f) => f.confidence)).toEqual(
      b.findings.map((f) => f.confidence),
    );
  });
});
