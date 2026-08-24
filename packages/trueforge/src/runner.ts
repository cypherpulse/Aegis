import {
  ApprovalError,
  makeEvent,
  type AgentEvent,
  type InvestigatorKind,
} from "@aegis/shared";
import { callTool, type ToolContext, type ToolRegistry } from "@aegis/mcp";
import type { ApprovalController } from "./approval.js";
import type { TrueForgeSession } from "./session.js";

export interface ToolInvocation {
  tool: string;
  input: unknown;
  reason: string;
}

export interface AgentRunContext {
  incidentId: string;
  investigator: InvestigatorKind;
  actor: string;
  agentName: string;
  /** Human-readable task prompt for the (real) harness turn. */
  taskPrompt: string;
  /** Deterministic tool plan executed against the MCP tools. */
  plan: ToolInvocation[];
  registry: ToolRegistry;
  toolCtx: ToolContext;
  approval: ApprovalController;
  emit: (event: AgentEvent) => void;
}

export interface ToolExecResult {
  tool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  /** True when a sensitive tool was blocked (approval denied/timed out). */
  blocked: boolean;
}

export interface AgentRunResult {
  mode: "harness" | "local";
  toolResults: ToolExecResult[];
  narrative?: string;
}

export interface AgentRunner {
  readonly mode: "harness" | "local";
  run(ctx: AgentRunContext): Promise<AgentRunResult>;
}

/**
 * Shared tool-calling loop used by both runners. Sensitive tools pass through
 * the approval gate first; a denied/timed-out approval blocks that single tool
 * and the loop continues (partial data), while a genuine tool execution error
 * propagates so the investigator can report FAILED (spec §12, §21).
 */
async function executeToolPlan(
  ctx: AgentRunContext,
): Promise<ToolExecResult[]> {
  const results: ToolExecResult[] = [];

  for (const step of ctx.plan) {
    const tool = ctx.registry.get(step.tool);

    if (tool.sensitive) {
      try {
        await ctx.approval.requestApproval({
          incidentId: ctx.incidentId,
          investigator: ctx.investigator,
          actor: ctx.actor,
          tool: tool.name,
          reason: step.reason,
        });
      } catch (err) {
        if (err instanceof ApprovalError) {
          results.push({
            tool: step.tool,
            input: step.input,
            output: null,
            durationMs: 0,
            blocked: true,
          });
          continue;
        }
        throw err;
      }
    }

    ctx.emit(
      makeEvent({
        incidentId: ctx.incidentId,
        type: "investigator.tool_called",
        actor: ctx.actor,
        payload: { tool: step.tool, input: step.input },
      }),
    );

    const { output, durationMs } = await callTool(tool, step.input, ctx.toolCtx);

    ctx.emit(
      makeEvent({
        incidentId: ctx.incidentId,
        type: "investigator.tool_completed",
        actor: ctx.actor,
        payload: { tool: step.tool, durationMs, output },
      }),
    );

    results.push({
      tool: step.tool,
      input: step.input,
      output,
      durationMs,
      blocked: false,
    });
  }

  return results;
}

/** Deterministic runtime — the default, fully offline "simulated harness". */
export class LocalAgentRunner implements AgentRunner {
  readonly mode = "local" as const;

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const toolResults = await executeToolPlan(ctx);
    return { mode: "local", toolResults };
  }
}

/**
 * Real Agent Harness runtime. Runs a real, bounded TrueForge turn for
 * narration/observability, then executes the read-only tool plan for the
 * actual investigation data.
 */
export class HarnessAgentRunner implements AgentRunner {
  readonly mode = "harness" as const;

  constructor(private readonly session: TrueForgeSession) {}

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const narrative = await this.session.narrateTurn(ctx.taskPrompt);
    const toolResults = await executeToolPlan(ctx);
    const result: AgentRunResult = { mode: "harness", toolResults };
    if (narrative !== undefined) result.narrative = narrative;
    return result;
  }
}

/** Pick the runner that matches the session mode. */
export function createAgentRunner(session: TrueForgeSession): AgentRunner {
  return session.mode === "harness"
    ? new HarnessAgentRunner(session)
    : new LocalAgentRunner();
}
