import {
  makeEvent,
  type InvestigationFinding,
  type InvestigatorKind,
} from "@aegis/shared";
import type { InvestigationContext } from "./context.js";
import { runBlockchainInvestigator } from "./investigators/blockchain.js";
import { runTreasuryInvestigator } from "./investigators/treasury.js";
import { runApplicationInvestigator } from "./investigators/application.js";
import { COMMANDER_AGENT_NAME } from "./specs.js";

export interface CommanderResult {
  findings: InvestigationFinding[];
  failed: InvestigatorKind[];
}

/**
 * The Incident Commander. Delegates to the three specialist investigators in
 * parallel and isolates their failures: it collects every finding, records
 * which investigators failed, and never lets one failure abort the others
 * (spec §8, §12).
 */
export async function runCommander(
  ctx: InvestigationContext,
): Promise<CommanderResult> {
  ctx.emit(
    makeEvent({
      incidentId: ctx.incident.id,
      type: "commander.started",
      actor: "commander",
      payload: {
        agent: COMMANDER_AGENT_NAME,
        sessionId: ctx.session.sessionId,
        mode: ctx.session.mode,
      },
    }),
  );

  const settled = await Promise.allSettled([
    runBlockchainInvestigator(ctx),
    runTreasuryInvestigator(ctx),
    runApplicationInvestigator(ctx),
  ]);

  const findings: InvestigationFinding[] = [];
  const failed: InvestigatorKind[] = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      findings.push(outcome.value);
      if (outcome.value.status === "FAILED") {
        failed.push(outcome.value.investigator);
      }
    }
    // Investigators catch internally and resolve to a FAILED finding, so a
    // rejected promise here would be an unexpected framework error; it simply
    // means that investigator contributed no finding.
  }

  return { findings, failed };
}
