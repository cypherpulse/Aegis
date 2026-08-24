import {
  makeEvent,
  type AgentEvent,
  type Evidence,
  type InvestigationFinding,
} from "@aegis/shared";
import { callTool } from "@aegis/mcp";
import { evidence, failedFinding, successFinding } from "../analysis.js";
import type { InvestigationContext } from "../context.js";
import { CODE_SPEC } from "../specs.js";

const ACTOR = CODE_SPEC.actor;

function emitEvent(
  ctx: InvestigationContext,
  type: AgentEvent["type"],
  payload: Record<string, unknown>,
): void {
  ctx.emit(
    makeEvent({ incidentId: ctx.incident.id, type, actor: ACTOR, payload }),
  );
}

async function codeCall(
  ctx: InvestigationContext,
  tool: string,
  input: unknown,
): Promise<unknown> {
  emitEvent(ctx, "code_investigator.tool_called", { tool, input });
  const { output, durationMs } = await callTool(
    ctx.registry.get(tool),
    input,
    ctx.toolCtx,
  );
  emitEvent(ctx, "code_investigator.tool_completed", { tool, durationMs });
  return output;
}

/** The analysis program executed in the sandbox. Self-contained ES module. */
const ANALYSIS_PROGRAM = `
const input = JSON.parse(process.env.SANDBOX_INPUT || "{}");
const drains = input.treasuryInsufficient === true && input.topUpEnabled === false;
const verdict = drains
  ? "Disabled treasury top-up combined with active payout retries drains the gas reserve, so payouts revert for insufficient gas."
  : "Code configuration alone does not explain the depletion.";
console.log(JSON.stringify({
  drains,
  verdict,
  topUpEnabled: input.topUpEnabled,
  maxRetries: input.maxRetries,
  retriesObserved: input.retriesObserved,
}));
`;

/**
 * Code Investigator (Phase 2). Discovers the suspicious code in the fixture via
 * read-only tools, then validates the hypothesis with a small analysis program
 * executed in the sandbox. Consumes prior findings for the incident numbers.
 */
export async function runCodeInvestigator(
  ctx: InvestigationContext,
  priorFindings: InvestigationFinding[],
): Promise<InvestigationFinding> {
  emitEvent(ctx, "code_investigator.started", { agent: CODE_SPEC.agentName });

  try {
    // 1. Find the suspicious config.
    const search = (await codeCall(ctx, "searchCode", {
      query: "TOP_UP_ENABLED",
    })) as { matches: Array<{ file: string; line: number; text: string }> };
    const hit = search.matches.find((m) => m.file.includes("gasConfig"));
    const configFile = hit?.file ?? search.matches[0]?.file ?? "src/gasConfig.js";

    // 2. Read it + the recent changes.
    const file = (await codeCall(ctx, "readFile", { path: configFile })) as {
      content: string;
    };
    const changes = (await codeCall(ctx, "inspectRecentChanges", {})) as {
      latestEntry: string | null;
    };

    const topUpEnabled = !/TOP_UP_ENABLED\s*=\s*false/.test(file.content);
    const maxRetries = Number(
      /MAX_RETRIES\s*=\s*(\d+)/.exec(file.content)?.[1] ?? "0",
    );

    // 3. Pull incident numbers from prior findings.
    const treasury = priorFindings.find(
      (f) => f.investigator === "TREASURY" && f.status === "SUCCESS",
    );
    const application = priorFindings.find(
      (f) => f.investigator === "APPLICATION" && f.status === "SUCCESS",
    );
    const treasuryInsufficient = treasury?.metadata["sufficient"] === false;
    const retriesObserved = Number(application?.metadata["retries"] ?? 0);

    // 4. Validate with the sandbox (real execution — not faked).
    let verdict = "sandbox unavailable";
    let drains = false;
    let sandboxDriver = "none";
    if (ctx.sandbox) {
      emitEvent(ctx, "sandbox.started", { driver: ctx.sandbox.name });
      const result = await ctx.sandbox.run({
        code: ANALYSIS_PROGRAM,
        input: { topUpEnabled, maxRetries, retriesObserved, treasuryInsufficient },
        timeoutMs: 20000,
      });
      sandboxDriver = result.driver;
      if (result.timedOut) {
        emitEvent(ctx, "sandbox.timeout", { driver: result.driver });
      } else if (result.exitCode !== 0) {
        emitEvent(ctx, "sandbox.failed", {
          driver: result.driver,
          exitCode: result.exitCode,
        });
      } else {
        const parsed = JSON.parse(result.stdout.trim() || "{}") as {
          drains?: boolean;
          verdict?: string;
        };
        drains = parsed.drains === true;
        verdict = parsed.verdict ?? verdict;
        emitEvent(ctx, "sandbox.completed", {
          driver: result.driver,
          durationMs: result.durationMs,
        });
      }
    }

    const ev: Evidence[] = [
      evidence(
        "code",
        "source",
        configFile,
        `TOP_UP_ENABLED is ${topUpEnabled ? "true" : "false"}, MAX_RETRIES is ${maxRetries}`,
      ),
    ];
    if (changes.latestEntry) {
      ev.push(
        evidence(
          "code",
          "recent-change",
          "CHANGELOG.md",
          changes.latestEntry.split("\n").slice(0, 3).join(" "),
        ),
      );
    }
    ev.push(
      evidence(
        "sandbox",
        "analysis",
        sandboxDriver,
        `sandbox verdict: ${verdict}`,
      ),
    );

    const confidence = drains ? 0.9 : topUpEnabled ? 0.4 : 0.6;

    emitEvent(ctx, "code_investigator.completed", { drains, confidence });

    return successFinding({
      investigator: "CODE",
      summary: drains
        ? "Payout service disabled treasury top-up while retrying failed payouts, draining the gas reserve."
        : "Inspected payout service code; configuration reviewed.",
      evidence: ev,
      confidence,
      severity: ctx.incident.severity,
      metadata: {
        configFile,
        topUpEnabled,
        maxRetries,
        drains,
        sandboxDriver,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitEvent(ctx, "code_investigator.failed", { error: message });
    return failedFinding("CODE", message);
  }
}
