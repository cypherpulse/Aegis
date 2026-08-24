import {
  InvestigatorError,
  makeEvent,
  type InvestigationFinding,
} from "@aegis/shared";
import type { ToolExecResult, ToolInvocation } from "@aegis/trueforge";
import { failedFinding } from "./analysis.js";
import { buildRunContext, type InvestigationContext } from "./context.js";
import type { AgentSpec } from "./specs.js";

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new InvestigatorError(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Shared investigator lifecycle: emit started, run the tool plan through the
 * runner under a timeout, analyze results into a finding, emit completed —
 * and on any error emit failed and return a FAILED finding so one investigator
 * can never crash the whole investigation (spec §12, §21).
 */
export async function runInvestigator(params: {
  ctx: InvestigationContext;
  spec: AgentSpec;
  taskPrompt: string;
  plan: ToolInvocation[];
  analyze: (
    results: ToolExecResult[],
    ctx: InvestigationContext,
  ) => Promise<InvestigationFinding> | InvestigationFinding;
  timeoutMs?: number;
}): Promise<InvestigationFinding> {
  const { ctx, spec } = params;

  ctx.emit(
    makeEvent({
      incidentId: ctx.incident.id,
      type: "investigator.started",
      actor: spec.actor,
      payload: { agent: spec.agentName, mode: ctx.runner.mode },
    }),
  );

  try {
    const runCtx = buildRunContext({
      ctx,
      investigator: spec.kind,
      actor: spec.actor,
      agentName: spec.agentName,
      taskPrompt: params.taskPrompt,
      plan: params.plan,
    });

    const result = await withTimeout(
      ctx.runner.run(runCtx),
      params.timeoutMs ?? 30_000,
      `${spec.kind} investigator`,
    );

    const finding = await params.analyze(result.toolResults, ctx);

    ctx.emit(
      makeEvent({
        incidentId: ctx.incident.id,
        type: "investigator.completed",
        actor: spec.actor,
        payload: {
          status: finding.status,
          confidence: finding.confidence,
          severity: finding.severity,
        },
      }),
    );

    return finding;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.emit(
      makeEvent({
        incidentId: ctx.incident.id,
        type: "investigator.failed",
        actor: spec.actor,
        payload: { error: message },
      }),
    );
    return failedFinding(spec.kind, message);
  }
}
