import { TrueForgeSession } from "@aegis/trueforge";
import type {
  Incident,
  InvestigationFinding,
  RootCause,
  RootCauseStatus,
  UnifiedEvidence,
} from "@aegis/shared";

const STATUSES: RootCauseStatus[] = ["COMPLETE", "PARTIAL", "INSUFFICIENT_EVIDENCE"];

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  for (const c of [fenced?.[1], text]) {
    if (!c) continue;
    const s = c.indexOf("{");
    const e = c.lastIndexOf("}");
    if (s === -1 || e <= s) continue;
    try {
      return JSON.parse(c.slice(s, e + 1)) as Record<string, unknown>;
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * In harness mode, let the aegis-commander agent synthesize the root cause from
 * the real findings + evidence, so the conclusion is shaped by the agent's
 * reasoning rather than only the deterministic heuristic. Falls back to the
 * deterministic root cause on any failure (never throws).
 */
export async function agentShapeRootCause(
  session: TrueForgeSession,
  incident: Incident,
  findings: InvestigationFinding[],
  unified: UnifiedEvidence,
  base: RootCause,
): Promise<{ rootCause: RootCause; shapedByAgent: boolean }> {
  if (session.mode !== "harness") return { rootCause: base, shapedByAgent: false };

  const findingsText = findings
    .map(
      (f) =>
        `- ${f.investigator} (${f.status}, confidence ${(f.confidence * 100).toFixed(0)}%, ${f.severity}): ${f.summary}`,
    )
    .join("\n");
  const evidenceText = unified.findings
    .flatMap((f) => f.evidence)
    .slice(0, 12)
    .map((e) => `- [${e.source}/${e.type}] ${e.reference}: ${e.observation}`)
    .join("\n");

  const prompt = [
    "You are the Incident Commander for Aegis. Determine the ROOT CAUSE (or all-clear)",
    "for this incident from the investigator findings and evidence below, and state the fix.",
    "",
    `Incident: "${incident.title}" (${incident.type}, ${incident.severity}) on ${incident.chain.name}.`,
    incident.description ? `Details: ${incident.description}` : "",
    "",
    "Findings:",
    findingsText,
    "",
    "Evidence (prefer entries with source 'onchain' — those are REAL chain reads for",
    "THIS specific contract; other sources may be generic subsystem telemetry):",
    evidenceText,
    "",
    `Correlation hypothesis so far: ${unified.hypothesis.title} (confidence ${unified.hypothesis.confidence}).`,
    "",
    "Write a conclusion SPECIFIC to this incident/contract — do not default to a generic",
    "'payout failure' story if the real on-chain evidence does not support it. If the",
    "contract looks healthy (normal activity, no failed transactions), say so plainly.",
    "",
    "Respond with ONLY this JSON object (no prose, no code fences):",
    '{"title": "<concise, specific root cause or status>", "explanation": "<2-4 sentences: the actual finding for THIS contract and the concrete next step>", "confidence": <0.0-1.0>, "status": "COMPLETE|PARTIAL|INSUFFICIENT_EVIDENCE"}',
    "Base confidence/status strictly on the evidence.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    // Use a FRESH session for synthesis: the investigation's session may have a
    // pending approval/question on its thread (from investigator tool gates),
    // which blocks new user messages. A clean session avoids that.
    const rc = await TrueForgeSession.start({ incidentId: `${incident.id}:rootcause`, emit: () => {} });
    if (rc.mode !== "harness") return { rootCause: base, shapedByAgent: false };
    // One retry: harness turns can transiently return empty.
    const text = (await rc.narrateTurn(prompt, 90_000)) ?? (await rc.narrateTurn(prompt, 90_000));
    if (!text) return { rootCause: base, shapedByAgent: false };
    const parsed = extractJson(text);
    if (!parsed) return { rootCause: base, shapedByAgent: false };

    const title =
      typeof parsed["title"] === "string" && parsed["title"].trim()
        ? (parsed["title"] as string).trim()
        : base.title;
    const explanation =
      typeof parsed["explanation"] === "string" && parsed["explanation"].trim()
        ? (parsed["explanation"] as string).trim()
        : base.explanation;
    let confidence = base.confidence;
    const rawConf = parsed["confidence"];
    if (typeof rawConf === "number" && Number.isFinite(rawConf)) {
      confidence = Math.max(0, Math.min(1, rawConf));
    }
    const rawStatus = String(parsed["status"] ?? base.status).toUpperCase();
    const status = STATUSES.includes(rawStatus as RootCauseStatus)
      ? (rawStatus as RootCauseStatus)
      : base.status;

    return {
      rootCause: { ...base, title, explanation, confidence, status },
      shapedByAgent: true,
    };
  } catch {
    return { rootCause: base, shapedByAgent: false };
  }
}
