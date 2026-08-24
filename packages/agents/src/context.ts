import type { AgentEvent, Incident, InvestigatorKind } from "@aegis/shared";
import type { ToolContext, ToolRegistry } from "@aegis/mcp";
import type { SandboxDriver } from "@aegis/sandbox";
import type {
  AgentRunContext,
  AgentRunner,
  ApprovalController,
  ToolInvocation,
  TrueForgeSession,
} from "@aegis/trueforge";

/** Everything the investigators and commander share for one investigation. */
export interface InvestigationContext {
  incident: Incident;
  session: TrueForgeSession;
  runner: AgentRunner;
  registry: ToolRegistry;
  toolCtx: ToolContext;
  approval: ApprovalController;
  emit: (event: AgentEvent) => void;
  /** Sandbox for the Code Investigator (Phase 2). */
  sandbox?: SandboxDriver;
}

export function buildRunContext(params: {
  ctx: InvestigationContext;
  investigator: InvestigatorKind;
  actor: string;
  agentName: string;
  taskPrompt: string;
  plan: ToolInvocation[];
}): AgentRunContext {
  return {
    incidentId: params.ctx.incident.id,
    investigator: params.investigator,
    actor: params.actor,
    agentName: params.agentName,
    taskPrompt: params.taskPrompt,
    plan: params.plan,
    registry: params.ctx.registry,
    toolCtx: params.ctx.toolCtx,
    approval: params.ctx.approval,
    emit: params.ctx.emit,
  };
}
