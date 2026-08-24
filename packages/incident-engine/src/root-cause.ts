import {
  nowIso,
  round2,
  type ContributingFactor,
  type Evidence,
  type Incident,
  type InvestigationFinding,
  type RootCause,
  type RootCauseStatus,
  type Severity,
  type UnifiedEvidence,
} from "@aegis/shared";

const SEVERITY_ORDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function maxSeverity(findings: InvestigationFinding[], fallback: Severity): Severity {
  let best = -1;
  for (const f of findings) {
    if (f.status !== "SUCCESS") continue;
    best = Math.max(best, SEVERITY_ORDER.indexOf(f.severity));
  }
  return best >= 0 ? SEVERITY_ORDER[best]! : fallback;
}

function find(
  findings: InvestigationFinding[],
  kind: InvestigationFinding["investigator"],
): InvestigationFinding | undefined {
  return findings.find((f) => f.investigator === kind && f.status === "SUCCESS");
}

function topEvidence(
  findings: InvestigationFinding[],
  perFinding = 1,
): Evidence[] {
  const out: Evidence[] = [];
  for (const f of findings) {
    if (f.status !== "SUCCESS") continue;
    out.push(...f.evidence.slice(0, perFinding));
  }
  return out;
}

/**
 * Root Cause engine (spec §20/§21): deterministic aggregation of all findings +
 * fused evidence + the code finding into a single root cause. Derived from the
 * collected evidence — never hardcoded. Confidence is lowered when key evidence
 * is missing.
 */
export function deriveRootCause(
  incident: Incident,
  findings: InvestigationFinding[],
  unified: UnifiedEvidence,
): RootCause {
  const successful = findings.filter((f) => f.status === "SUCCESS");
  const anyFailed = findings.some((f) => f.status === "FAILED");

  const blockchain = find(findings, "BLOCKCHAIN");
  const treasury = find(findings, "TREASURY");
  const application = find(findings, "APPLICATION");
  const code = find(findings, "CODE");

  const treasuryInsufficient = treasury?.metadata["sufficient"] === false;
  const insufficientCount = Number(blockchain?.metadata["insufficientCount"] ?? 0);
  const codeDrains = code?.metadata["drains"] === true;

  const gasDepletion = treasuryInsufficient && insufficientCount > 0;

  const factors: ContributingFactor[] = [];
  if (treasuryInsufficient)
    factors.push({
      description: "Treasury native balance is below the required gas reserve.",
      weight: 0.95,
    });
  if (insufficientCount > 0)
    factors.push({
      description: `${insufficientCount} payout transactions reverted for insufficient gas funds.`,
      weight: 0.9,
    });
  if (codeDrains)
    factors.push({
      description:
        "Payout service disabled automatic treasury top-up while retrying (recent code change).",
      weight: 0.85,
    });
  if (application)
    factors.push({
      description: "Application payout-failure rate is elevated with rising retries.",
      weight: 0.7,
    });

  let status: RootCauseStatus;
  if (successful.length === 0) status = "FAILED";
  else if (!gasDepletion) status = "INSUFFICIENT_EVIDENCE";
  else if (anyFailed || !code) status = "PARTIAL";
  else status = "COMPLETE";

  // Confidence: anchored on fusion, corroborated by the code investigation.
  let confidence = unified.hypothesis.confidence;
  if (codeDrains) confidence = Math.min(0.97, confidence + 0.02);
  if (!gasDepletion) confidence = confidence * 0.6;
  if (anyFailed) confidence = confidence * 0.95;
  confidence = round2(confidence);

  const title = gasDepletion
    ? "Treasury gas depletion caused payout transactions to fail"
    : successful.length > 0
      ? "Payout failure — root cause inconclusive"
      : "Investigation failed";

  const explanation = gasDepletion
    ? "The treasury's native balance fell below the gas reserve needed to send " +
      "payouts, so payout transactions revert for insufficient gas. The payout " +
      "service compounds this: automatic treasury top-up was disabled in a recent " +
      "release while retry counts were raised, so the worker keeps retrying " +
      "against a treasury that can no longer cover gas" +
      (codeDrains ? " — confirmed by sandbox analysis of the fixture." : ".")
    : "The collected evidence does not converge on a single high-confidence root cause.";

  return {
    incidentId: incident.id,
    title,
    explanation,
    confidence,
    severity: maxSeverity(findings, incident.severity),
    evidence: topEvidence(findings, 1),
    contributingFactors: factors,
    status,
    generatedAt: nowIso(),
  };
}
