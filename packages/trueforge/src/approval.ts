import {
  ApprovalError,
  makeEvent,
  type AgentEvent,
  type InvestigatorKind,
} from "@aegis/shared";

export type ApprovalMode = "auto" | "manual";

export interface ApprovalRequest {
  incidentId: string;
  investigator: InvestigatorKind;
  actor: string;
  tool: string;
  reason: string;
}

/**
 * Resolver for manual approvals. Resolve `true` to approve, `false` to deny.
 * If it does not settle within the policy timeout, the gate times out and the
 * tool is blocked — this is the "critical incident, slow human" path.
 */
export type ApprovalResolver = (req: ApprovalRequest) => Promise<boolean>;

export interface ApprovalPolicy {
  mode: ApprovalMode;
  /** Max time to wait for a manual decision before timing out. */
  timeoutMs: number;
  resolver?: ApprovalResolver;
}

export const AUTO_APPROVAL_POLICY: ApprovalPolicy = {
  mode: "auto",
  timeoutMs: 30_000,
};

const TIMED_OUT = Symbol("approval-timeout");

async function raceTimeout<T>(
  p: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Drives the human-in-the-loop approval gate around sensitive tools.
 *
 * - `auto`: emits approval.requested → approval.granted immediately (keeps the
 *   offline demo deterministic).
 * - `manual`: emits approval.requested, waits on the resolver up to timeoutMs,
 *   then emits approval.granted / approval.denied / approval.timeout. On deny or
 *   timeout it throws ApprovalError so the caller can block the tool and carry
 *   on without crashing.
 */
export class ApprovalController {
  constructor(
    private readonly policy: ApprovalPolicy,
    private readonly emit: (event: AgentEvent) => void,
  ) {}

  async requestApproval(req: ApprovalRequest): Promise<void> {
    this.emit(
      makeEvent({
        incidentId: req.incidentId,
        type: "approval.requested",
        actor: req.actor,
        payload: { tool: req.tool, reason: req.reason, mode: this.policy.mode },
      }),
    );

    if (this.policy.mode === "auto" || !this.policy.resolver) {
      this.emit(
        makeEvent({
          incidentId: req.incidentId,
          type: "approval.granted",
          actor: req.actor,
          payload: { tool: req.tool, auto: true },
        }),
      );
      return;
    }

    const decision = await raceTimeout(
      this.policy.resolver(req),
      this.policy.timeoutMs,
    );

    if (decision === TIMED_OUT) {
      this.emit(
        makeEvent({
          incidentId: req.incidentId,
          type: "approval.timeout",
          actor: req.actor,
          payload: { tool: req.tool, timeoutMs: this.policy.timeoutMs },
        }),
      );
      throw new ApprovalError("TIMEOUT", `Approval timed out for ${req.tool}`, {
        tool: req.tool,
      });
    }

    if (decision) {
      this.emit(
        makeEvent({
          incidentId: req.incidentId,
          type: "approval.granted",
          actor: req.actor,
          payload: { tool: req.tool, auto: false },
        }),
      );
      return;
    }

    this.emit(
      makeEvent({
        incidentId: req.incidentId,
        type: "approval.denied",
        actor: req.actor,
        payload: { tool: req.tool },
      }),
    );
    throw new ApprovalError("APPROVAL", `Approval denied for ${req.tool}`, {
      tool: req.tool,
    });
  }
}
