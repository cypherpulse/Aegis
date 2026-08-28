import { fileURLToPath } from "node:url";
import {
  makeEvent,
  NullStore,
  toSafeError,
  type AgentEvent,
  type Incident,
  type IncidentStatus,
  type InvestigationFinding,
  type InvestigationStore,
  type InvestigatorKind,
  type RootCause,
  type UnifiedEvidence,
} from "@aegis/shared";
import { createBlockchainProvider, type BlockchainProvider } from "@aegis/blockchain";
import { createToolRegistry } from "@aegis/mcp";
import { createSandbox, type SandboxDriver } from "@aegis/sandbox";
import {
  ApprovalController,
  AUTO_APPROVAL_POLICY,
  createAgentRunner,
  TrueForgeSession,
  type ApprovalPolicy,
  type SessionMode,
  type TrueForgeConfig,
} from "@aegis/trueforge";
import {
  runCodeInvestigator,
  runCommander,
  type InvestigationContext,
} from "@aegis/agents";
import { fuseEvidence } from "./fusion.js";
import { deriveRootCause } from "./root-cause.js";
import { agentShapeRootCause } from "./agent-root-cause.js";

export interface RunInvestigationOptions {
  /** Live event sink (e.g. SSE). Called for every emitted event. */
  onEvent?: (event: AgentEvent) => void;
  /** TrueForge credentials; when omitted, read from the environment. */
  config?: TrueForgeConfig | null;
  /** Approval policy for sensitive tools (defaults to auto-approve). */
  approvalPolicy?: ApprovalPolicy;
  /** Override the blockchain provider (tests / real RPC). */
  provider?: BlockchainProvider;
  /** Force the deterministic simulator provider (used by the demo). */
  forceSimulator?: boolean;
  /** Persistence port. Defaults to a no-op store. */
  store?: InvestigationStore;
  /** Code fixture root for the Code Investigator. */
  codeRoot?: string;
  /** Sandbox driver. Defaults to auto-selected (docker→subprocess). */
  sandbox?: SandboxDriver;
}

export interface InvestigationResult {
  incident: Incident;
  findings: InvestigationFinding[];
  failed: InvestigatorKind[];
  unifiedEvidence: UnifiedEvidence;
  rootCause: RootCause;
  events: AgentEvent[];
  sessionMode: SessionMode;
}

function defaultCodeRoot(opts: RunInvestigationOptions): string {
  // Anchor on the repo layout (packages/incident-engine/src → repo root) so the
  // fixture resolves regardless of the process working directory.
  return (
    opts.codeRoot ??
    process.env.CODE_FIXTURE_ROOT ??
    fileURLToPath(new URL("../../../fixtures/demo-app", import.meta.url))
  );
}

/**
 * End-to-end Phase 2 flow (spec §9/§29):
 * incident → TrueForge session → commander → 3 investigators → evidence fusion →
 * code investigator → sandbox → root cause. Every transition is persisted via
 * the injected store; every step emits a structured event.
 */
export async function runInvestigation(
  incident: Incident,
  opts: RunInvestigationOptions = {},
): Promise<InvestigationResult> {
  const events: AgentEvent[] = [];
  const emit = (event: AgentEvent): void => {
    events.push(event);
    opts.onEvent?.(event);
  };
  const store = opts.store ?? new NullStore();
  const withStatus = (status: IncidentStatus): Incident => ({
    ...incident,
    status,
  });

  emit(
    makeEvent({
      incidentId: incident.id,
      type: "incident.created",
      actor: "system",
      payload: { type: incident.type, severity: incident.severity },
    }),
  );

  try {
    emit(
      makeEvent({
        incidentId: incident.id,
        type: "investigation.started",
        actor: "system",
        payload: { chain: incident.chain.name },
      }),
    );

    const session = await TrueForgeSession.start({
      incidentId: incident.id,
      emit,
      config: opts.config ?? null,
    });
    await store.started({ sessionId: session.sessionId, mode: session.mode });

    const provider =
      opts.provider ??
      createBlockchainProvider({ forceSimulator: opts.forceSimulator ?? false });
    const sandbox = opts.sandbox ?? (await createSandbox());

    const ctx: InvestigationContext = {
      incident: withStatus("INVESTIGATING"),
      session,
      runner: createAgentRunner(session),
      registry: createToolRegistry(),
      toolCtx: { provider, codeRoot: defaultCodeRoot(opts) },
      approval: new ApprovalController(
        opts.approvalPolicy ?? AUTO_APPROVAL_POLICY,
        emit,
      ),
      emit,
      sandbox,
    };

    // --- Commander + 3 investigators ---
    await store.stage("COMMANDER");
    const { findings, failed } = await runCommander(ctx);
    for (const f of findings) await store.recordFinding(f);

    // --- Evidence Fusion ---
    await store.stage("FUSION");
    emit(
      makeEvent({
        incidentId: incident.id,
        type: "evidence.fusion_started",
        actor: "fusion",
        payload: { findingCount: findings.length },
      }),
    );
    const unifiedEvidence = fuseEvidence(incident.id, findings);
    emit(
      makeEvent({
        incidentId: incident.id,
        type: "evidence.fusion_completed",
        actor: "fusion",
        payload: {
          status: unifiedEvidence.status,
          hypothesis: unifiedEvidence.hypothesis.title,
          confidence: unifiedEvidence.hypothesis.confidence,
        },
      }),
    );

    // --- Code Investigator (+ Sandbox) ---
    await store.stage("CODE");
    const codeFinding = await runCodeInvestigator(ctx, findings);
    findings.push(codeFinding);
    await store.recordFinding(codeFinding);
    if (codeFinding.status === "FAILED") failed.push("CODE");

    // --- Root Cause ---
    await store.stage("ROOT_CAUSE");
    emit(
      makeEvent({
        incidentId: incident.id,
        type: "root_cause.started",
        actor: "root-cause",
        payload: {},
      }),
    );
    const baseRootCause = deriveRootCause(incident, findings, unifiedEvidence);
    // In harness mode, let aegis-commander shape the final root cause from the
    // real findings/evidence (deterministic result is the fallback).
    const { rootCause, shapedByAgent } = await agentShapeRootCause(
      session,
      incident,
      findings,
      unifiedEvidence,
      baseRootCause,
    );
    await store.recordRootCause(rootCause);
    emit(
      makeEvent({
        incidentId: incident.id,
        type: "root_cause.completed",
        actor: "root-cause",
        payload: {
          title: rootCause.title,
          confidence: rootCause.confidence,
          status: rootCause.status,
          shapedBy: shapedByAgent ? "aegis-commander" : "deterministic",
        },
      }),
    );

    // --- Finalize ---
    const invStatus =
      rootCause.status === "FAILED"
        ? "FAILED"
        : failed.length > 0
          ? "PARTIAL"
          : "COMPLETE";
    const finalStatus: IncidentStatus =
      invStatus === "FAILED" ? "FAILED" : "INVESTIGATION_COMPLETE";
    await store.finished(invStatus);

    emit(
      makeEvent({
        incidentId: incident.id,
        type:
          invStatus === "FAILED"
            ? "investigation.failed"
            : "investigation.completed",
        actor: "system",
        payload: { status: invStatus, failed },
      }),
    );

    return {
      incident: withStatus(finalStatus),
      findings,
      failed,
      unifiedEvidence,
      rootCause,
      events,
      sessionMode: session.mode,
    };
  } catch (err) {
    const safe = toSafeError(err);
    emit(
      makeEvent({
        incidentId: incident.id,
        type: "investigation.failed",
        actor: "system",
        payload: { error: safe.message, code: safe.code },
      }),
    );
    await store.finished("FAILED", safe.message).catch(() => {});
    const unifiedEvidence: UnifiedEvidence = {
      incidentId: incident.id,
      findings: [],
      correlatedSignals: [],
      hypothesis: {
        title: "Investigation failed",
        confidence: 0,
        rationale: safe.message,
      },
      summary: "The investigation could not be completed.",
      status: "FAILED",
      generatedAt: new Date().toISOString(),
    };
    const rootCause: RootCause = {
      incidentId: incident.id,
      title: "Investigation failed",
      explanation: safe.message,
      confidence: 0,
      severity: incident.severity,
      evidence: [],
      contributingFactors: [],
      status: "FAILED",
      generatedAt: new Date().toISOString(),
    };
    return {
      incident: withStatus("FAILED"),
      findings: [],
      failed: [],
      unifiedEvidence,
      rootCause,
      events,
      sessionMode: "local",
    };
  }
}
