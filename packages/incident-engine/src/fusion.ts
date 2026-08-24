import {
  nowIso,
  round2,
  type CorrelatedSignal,
  type InvestigationFinding,
  type UnifiedEvidence,
  type UnifiedEvidenceStatus,
} from "@aegis/shared";

function findBy(
  findings: InvestigationFinding[],
  kind: InvestigationFinding["investigator"],
): InvestigationFinding | undefined {
  return findings.find((f) => f.investigator === kind && f.status === "SUCCESS");
}

function refs(finding: InvestigationFinding | undefined): string[] {
  return (finding?.evidence ?? [])
    .map((e) => e.reference)
    .filter((r) => r.length > 0);
}

/**
 * Deterministic Evidence Fusion (spec §14). Correlates the specialist findings
 * into a unified hypothesis. It is a pure domain function — no model, no extra
 * agent — and it never discards the original findings.
 */
export function fuseEvidence(
  incidentId: string,
  findings: InvestigationFinding[],
): UnifiedEvidence {
  const blockchain = findBy(findings, "BLOCKCHAIN");
  const treasury = findBy(findings, "TREASURY");
  const application = findBy(findings, "APPLICATION");

  const insufficientCount = Number(
    blockchain?.metadata["insufficientCount"] ?? 0,
  );
  const treasuryInsufficient = treasury?.metadata["sufficient"] === false;

  const signals: CorrelatedSignal[] = [];

  if (insufficientCount > 0 && treasuryInsufficient) {
    signals.push({
      id: "sig-gas-depletion",
      description:
        "Treasury native balance is below the required gas reserve, causing " +
        "onchain payout transactions to revert for insufficient gas funds.",
      investigators: ["TREASURY", "BLOCKCHAIN"],
      supportingEvidence: [...refs(treasury), ...refs(blockchain)],
      weight: 0.95,
    });
  }

  if (application && (blockchain || treasury)) {
    signals.push({
      id: "sig-payout-retries",
      description:
        "Application payout-worker retries and elevated failure alerts " +
        "correlate with the onchain payout reverts.",
      investigators: ["APPLICATION", blockchain ? "BLOCKCHAIN" : "TREASURY"],
      supportingEvidence: [
        ...refs(application),
        ...refs(blockchain ?? treasury),
      ],
      weight: 0.9,
    });
  }

  const successful = findings.filter((f) => f.status === "SUCCESS");
  const anyFailed = findings.some((f) => f.status === "FAILED");
  const status: UnifiedEvidenceStatus =
    successful.length === 0 ? "FAILED" : anyFailed ? "PARTIAL" : "COMPLETE";

  const base =
    successful.length > 0
      ? successful.reduce((s, f) => s + f.confidence, 0) / successful.length
      : 0;
  const boost = 0.02 * Math.min(signals.length, 2);
  const confidence = round2(Math.min(0.98, base + boost));

  const gasDepletion = insufficientCount > 0 && treasuryInsufficient;
  const title = gasDepletion
    ? "Treasury gas depletion"
    : successful.length > 0
      ? "Payout failure — root cause inconclusive"
      : "Investigation failed";

  const summary = gasDepletion
    ? "The treasury's native balance fell below the gas reserve required to " +
      "process payouts. Payout transactions are reverting for insufficient " +
      "gas funds, and the application payout worker is retrying — consistent " +
      "across all three investigators."
    : `Fused ${successful.length} successful finding(s)` +
      (anyFailed ? " with one or more investigator failures." : ".");

  return {
    incidentId,
    findings, // preserved in full
    correlatedSignals: signals,
    hypothesis: {
      title,
      confidence,
      rationale: gasDepletion
        ? "Independent blockchain, treasury, and application evidence all point " +
          "to gas depletion as the proximate cause."
        : "Insufficient corroborating evidence for a single high-confidence " +
          "root cause.",
    },
    summary,
    status,
    generatedAt: nowIso(),
  };
}
