/**
 * Phase 1 hero demo. Loads the deterministic TREASURY_GAS_DEPLETION incident,
 * runs the full investigation (TrueForge session → commander → 3 investigators
 * → evidence fusion), streams the event timeline, and prints the final result.
 *
 * Runs with zero credentials (deterministic local runtime). If TRUEFORGE_* /
 * BASE_SEPOLIA_RPC_URL are set in the environment, the real paths activate.
 */
// Deterministic by default (no Docker/DB needed). Set SANDBOX_DRIVER=docker to
// run the sandbox analysis inside the hardened container instead.
process.env.SANDBOX_DRIVER ??= "subprocess";
import type { AgentEvent, InvestigationFinding } from "@aegis/shared";
import { getHeroIncident } from "@aegis/simulator";
import { runInvestigation } from "@aegis/incident-engine";

const line = (s = ""): void => process.stdout.write(s + "\n");
const rule = (): void => line("─".repeat(64));

function formatEvent(e: AgentEvent): string {
  const t = new Date(e.timestamp).toISOString().slice(11, 19);
  const p = e.payload as Record<string, unknown>;
  const detail =
    p["tool"] !== undefined
      ? ` [${String(p["tool"])}]`
      : p["hypothesis"] !== undefined
        ? ` → ${String(p["hypothesis"])} (${String(p["confidence"])})`
        : p["agent"] !== undefined
          ? ` (${String(p["agent"])})`
          : "";
  return `  ${t}  ${e.type.padEnd(28)} ${e.actor}${detail}`;
}

function printFinding(f: InvestigationFinding): void {
  const icon = f.status === "SUCCESS" ? "✓" : "✗";
  line(
    `  ${icon} ${f.investigator.padEnd(12)} ${f.status.padEnd(8)} ` +
      `conf=${f.confidence}  sev=${f.severity}`,
  );
  line(`     ${f.summary}`);
  for (const ev of f.evidence) {
    line(`       • [${ev.type}] ${ev.observation}`);
  }
}

async function main(): Promise<void> {
  const incident = getHeroIncident();

  rule();
  line("AEGIS — Full Investigation Pipeline");
  line("incident → TrueForge → commander → 3 investigators → fusion →");
  line("code investigator → sandbox → root cause");
  rule();
  line(`Incident:  ${incident.id}  ${incident.title}`);
  line(`Type:      ${incident.type}`);
  line(`Severity:  ${incident.severity}`);
  line(`Protocol:  ${incident.affectedProtocol}`);
  line(`Chain:     ${incident.chain.name} (${incident.chain.chainId})`);
  rule();
  line("Timeline:");

  const result = await runInvestigation(incident, {
    onEvent: (e) => line(formatEvent(e)),
  });

  rule();
  line(`TrueForge session mode: ${result.sessionMode.toUpperCase()}`);
  rule();
  line("Findings:");
  for (const f of result.findings) printFinding(f);

  rule();
  const u = result.unifiedEvidence;
  line("Evidence Fusion:");
  line(`  Status:      ${u.status}`);
  line(`  Hypothesis:  ${u.hypothesis.title}`);
  line(`  Confidence:  ${u.hypothesis.confidence}`);
  line(`  Signals:     ${u.correlatedSignals.length} correlated`);
  for (const s of u.correlatedSignals) {
    line(`    • ${s.description} (weight ${s.weight})`);
  }
  line();
  line(`  ${u.summary}`);

  rule();
  const rc = result.rootCause;
  line("Root Cause:");
  line(`  Status:      ${rc.status}`);
  line(`  Title:       ${rc.title}`);
  line(`  Confidence:  ${rc.confidence}`);
  line(`  Severity:    ${rc.severity}`);
  line("  Contributing factors:");
  for (const f of rc.contributingFactors) {
    line(`    • (${f.weight}) ${f.description}`);
  }
  line();
  line(`  ${rc.explanation}`);

  rule();
  line(`Incident status: ${result.incident.status}`);
  rule();

  if (rc.status === "FAILED") process.exitCode = 1;
}

main().catch((err) => {
  console.error("Demo failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
