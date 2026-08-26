// Event -> pipeline-state mapping (Part VI). Pure + unit-testable.

import type { InvestigationStatus, InvestigatorKind, RootCauseStatus, Severity } from "@/types/api";
import {
  readBoolean,
  readDriver,
  readInvestigationStatus,
  readNumber,
  readRootCauseStatus,
  readSessionMode,
  readSeverity,
  readString,
  readStringArray,
  type SandboxDriver,
  type SessionMode,
  type StoredEvent,
} from "@/types/events";

export type NodeState = "waiting" | "active" | "complete" | "failed" | "partial" | "approval";

export type NodeId =
  | "incident"
  | "session"
  | "commander"
  | "blockchain"
  | "treasury"
  | "application"
  | "fusion"
  | "code"
  | "sandbox"
  | "rootCause";

export interface InvestigatorNodeInfo {
  state: NodeState;
  confidence?: number | undefined;
  severity?: Severity | undefined;
  lastTool?: string | undefined;
  tools: { tool: string; durationMs?: number | undefined; completed: boolean }[];
  error?: string | undefined;
}

export interface ApprovalGate {
  tool: string;
  reason?: string | undefined;
  state: "requested" | "granted" | "denied" | "timeout";
  auto?: boolean | undefined;
  timeoutMs?: number | undefined;
  actor: string;
}

export interface SandboxInfo {
  driver?: SandboxDriver | undefined;
  state: NodeState;
  durationMs?: number | undefined;
  exitCode?: number | undefined;
}

export interface FusionInfo {
  state: NodeState;
  findingCount?: number | undefined;
  hypothesis?: string | undefined;
  confidence?: number | undefined;
  status?: string | undefined;
}

export interface PipelineState {
  nodes: Record<NodeId, NodeState>;
  investigators: Record<"blockchain" | "treasury" | "application", InvestigatorNodeInfo>;
  code: InvestigatorNodeInfo & { drains?: boolean | undefined };
  fusion: FusionInfo;
  sandbox: SandboxInfo;
  session: {
    mode?: SessionMode | undefined;
    sessionId?: string | undefined;
    agent?: string | undefined;
    fallback?: boolean | undefined;
    reason?: string | undefined;
  };
  commander: { agent?: string | undefined };
  approvals: ApprovalGate[];
  rootCause: {
    title?: string | undefined;
    confidence?: number | undefined;
    status?: RootCauseStatus | undefined;
  };
  overall: {
    status?: InvestigationStatus | undefined;
    failed: string[];
    error?: string | undefined;
    code?: string | undefined;
    started: boolean;
    finished: boolean;
  };
  chain?: string | undefined;
  lastSeq: number;
}

const ACTOR_TO_INVESTIGATOR: Record<string, "blockchain" | "treasury" | "application"> = {
  "blockchain-investigator": "blockchain",
  "treasury-investigator": "treasury",
  "application-investigator": "application",
};

export const INVESTIGATOR_LABEL: Record<string, string> = {
  blockchain: "Blockchain Investigator",
  treasury: "Treasury Investigator",
  application: "Application Investigator",
  code: "Code Investigator",
  commander: "Incident Commander",
  fusion: "Evidence Fusion",
  "root-cause": "Root Cause",
  trueforge: "TrueForge",
  system: "Aegis",
};

export const KIND_TO_NODE: Record<InvestigatorKind, NodeId> = {
  BLOCKCHAIN: "blockchain",
  TREASURY: "treasury",
  APPLICATION: "application",
  CODE: "code",
};

function emptyInvestigator(): InvestigatorNodeInfo {
  return { state: "waiting", tools: [] };
}

export function initialPipelineState(): PipelineState {
  return {
    nodes: {
      incident: "waiting",
      session: "waiting",
      commander: "waiting",
      blockchain: "waiting",
      treasury: "waiting",
      application: "waiting",
      fusion: "waiting",
      code: "waiting",
      sandbox: "waiting",
      rootCause: "waiting",
    },
    investigators: {
      blockchain: emptyInvestigator(),
      treasury: emptyInvestigator(),
      application: emptyInvestigator(),
    },
    code: emptyInvestigator(),
    fusion: { state: "waiting" },
    sandbox: { state: "waiting" },
    session: {},
    commander: {},
    approvals: [],
    rootCause: {},
    overall: { failed: [], started: false, finished: false },
    lastSeq: 0,
  };
}

function applyToolCalled(info: InvestigatorNodeInfo, tool: string | undefined): void {
  if (!tool) return;
  info.lastTool = tool;
  info.tools = [...info.tools, { tool, completed: false }];
}

function applyToolCompleted(
  info: InvestigatorNodeInfo,
  tool: string | undefined,
  durationMs: number | undefined,
): void {
  if (!tool) return;
  let matched = false;
  info.tools = info.tools.map((entry) => {
    if (!matched && entry.tool === tool && !entry.completed) {
      matched = true;
      return { tool, durationMs, completed: true };
    }
    return entry;
  });
  if (!matched) info.tools = [...info.tools, { tool, durationMs, completed: true }];
}

/** Fold a single event into the pipeline state (mutates a shallow-cloned draft). */
export function applyEvent(previous: PipelineState, event: StoredEvent): PipelineState {
  const state: PipelineState = {
    ...previous,
    nodes: { ...previous.nodes },
    investigators: {
      blockchain: { ...previous.investigators.blockchain },
      treasury: { ...previous.investigators.treasury },
      application: { ...previous.investigators.application },
    },
    code: { ...previous.code },
    fusion: { ...previous.fusion },
    sandbox: { ...previous.sandbox },
    session: { ...previous.session },
    commander: { ...previous.commander },
    approvals: [...previous.approvals],
    rootCause: { ...previous.rootCause },
    overall: { ...previous.overall, failed: [...previous.overall.failed] },
  };
  state.lastSeq = Math.max(previous.lastSeq, event.seq);

  const p = event.payload;
  const investigatorKey = ACTOR_TO_INVESTIGATOR[event.actor];

  switch (event.type) {
    case "incident.created":
      state.nodes.incident = "complete";
      break;
    case "investigation.started":
      state.nodes.incident = "complete";
      state.overall.started = true;
      state.overall.status = "RUNNING";
      state.chain = readString(p, "chain") ?? state.chain;
      break;
    case "session.created":
      state.nodes.session = "complete";
      state.session = {
        mode: readSessionMode(p),
        sessionId: readString(p, "sessionId"),
        agent: readString(p, "agent"),
        fallback: readBoolean(p, "fallback"),
        reason: readString(p, "reason"),
      };
      break;
    case "commander.started":
      state.nodes.commander = "active";
      state.commander = { agent: readString(p, "agent") };
      break;
    case "investigator.started":
      if (investigatorKey) {
        state.investigators[investigatorKey].state = "active";
        state.nodes[investigatorKey] = "active";
        state.nodes.commander = "complete";
      }
      break;
    case "investigator.tool_called":
      if (investigatorKey) {
        applyToolCalled(state.investigators[investigatorKey], readString(p, "tool"));
        state.investigators[investigatorKey].state = "active";
        state.nodes[investigatorKey] = "active";
      }
      break;
    case "investigator.tool_completed":
      if (investigatorKey) {
        applyToolCompleted(
          state.investigators[investigatorKey],
          readString(p, "tool"),
          readNumber(p, "durationMs"),
        );
      }
      break;
    case "investigator.completed":
      if (investigatorKey) {
        const failed = readString(p, "status") === "FAILED";
        state.investigators[investigatorKey].state = failed ? "failed" : "complete";
        state.investigators[investigatorKey].confidence = readNumber(p, "confidence");
        state.investigators[investigatorKey].severity = readSeverity(p);
        state.nodes[investigatorKey] = failed ? "failed" : "complete";
      }
      break;
    case "investigator.failed":
      if (investigatorKey) {
        state.investigators[investigatorKey].state = "failed";
        state.investigators[investigatorKey].error = readString(p, "error");
        state.nodes[investigatorKey] = "failed";
      }
      break;
    case "approval.requested": {
      const tool = readString(p, "tool") ?? "unknown";
      state.approvals = [
        ...state.approvals,
        { tool, reason: readString(p, "reason"), state: "requested", actor: event.actor },
      ];
      break;
    }
    case "approval.granted":
    case "approval.denied":
    case "approval.timeout": {
      const tool = readString(p, "tool") ?? "unknown";
      const resolution =
        event.type === "approval.granted"
          ? "granted"
          : event.type === "approval.denied"
            ? "denied"
            : "timeout";
      let updated = false;
      state.approvals = state.approvals.map((gate) => {
        if (!updated && gate.tool === tool && gate.state === "requested") {
          updated = true;
          return {
            ...gate,
            state: resolution,
            auto: readBoolean(p, "auto"),
            timeoutMs: readNumber(p, "timeoutMs"),
          };
        }
        return gate;
      });
      if (!updated) {
        state.approvals = [
          ...state.approvals,
          {
            tool,
            state: resolution,
            auto: readBoolean(p, "auto"),
            timeoutMs: readNumber(p, "timeoutMs"),
            actor: event.actor,
          },
        ];
      }
      break;
    }
    case "evidence.fusion_started":
      state.fusion.state = "active";
      state.fusion.findingCount = readNumber(p, "findingCount");
      state.nodes.fusion = "active";
      state.nodes.commander = "complete";
      break;
    case "evidence.fusion_completed":
      state.fusion.state = "complete";
      state.fusion.hypothesis = readString(p, "hypothesis");
      state.fusion.confidence = readNumber(p, "confidence");
      state.fusion.status = readString(p, "status");
      state.nodes.fusion = "complete";
      break;
    case "code_investigator.started":
      state.code.state = "active";
      state.nodes.code = "active";
      break;
    case "code_investigator.tool_called":
      applyToolCalled(state.code, readString(p, "tool"));
      state.code.state = "active";
      state.nodes.code = "active";
      break;
    case "code_investigator.tool_completed":
      applyToolCompleted(state.code, readString(p, "tool"), readNumber(p, "durationMs"));
      break;
    case "code_investigator.completed":
      state.code.state = "complete";
      state.code.confidence = readNumber(p, "confidence");
      state.code.drains = readBoolean(p, "drains");
      state.nodes.code = "complete";
      break;
    case "code_investigator.failed":
      state.code.state = "failed";
      state.code.error = readString(p, "error");
      state.nodes.code = "failed";
      break;
    case "sandbox.started":
      state.sandbox = { driver: readDriver(p), state: "active" };
      state.nodes.sandbox = "active";
      break;
    case "sandbox.completed":
      state.sandbox = {
        driver: readDriver(p) ?? state.sandbox.driver,
        state: "complete",
        durationMs: readNumber(p, "durationMs"),
      };
      state.nodes.sandbox = "complete";
      break;
    case "sandbox.failed":
      state.sandbox = {
        driver: readDriver(p) ?? state.sandbox.driver,
        state: "failed",
        exitCode: readNumber(p, "exitCode"),
      };
      state.nodes.sandbox = "failed";
      break;
    case "sandbox.timeout":
      state.sandbox = { driver: readDriver(p) ?? state.sandbox.driver, state: "failed" };
      state.nodes.sandbox = "failed";
      break;
    case "root_cause.started":
      state.nodes.rootCause = "active";
      break;
    case "root_cause.completed":
      state.rootCause = {
        title: readString(p, "title"),
        confidence: readNumber(p, "confidence"),
        status: readRootCauseStatus(p),
      };
      state.nodes.rootCause =
        state.rootCause.status === "PARTIAL" || state.rootCause.status === "INSUFFICIENT_EVIDENCE"
          ? "partial"
          : state.rootCause.status === "FAILED"
            ? "failed"
            : "complete";
      break;
    case "investigation.completed": {
      const status = readInvestigationStatus(p);
      state.overall.status = status;
      state.overall.failed = readStringArray(p, "failed") ?? [];
      state.overall.finished = true;
      break;
    }
    case "investigation.failed":
      state.overall.status = "FAILED";
      state.overall.error = readString(p, "error");
      state.overall.code = readString(p, "code");
      state.overall.finished = true;
      break;
    default:
      break;
  }

  return state;
}

export function reduceEvents(events: StoredEvent[]): PipelineState {
  return events.reduce<PipelineState>(applyEvent, initialPipelineState());
}

/** Merge new events into an existing list, de-duping by seq and keeping order. */
export function mergeEvents(existing: StoredEvent[], incoming: StoredEvent[]): StoredEvent[] {
  const bySeq = new Map<number, StoredEvent>();
  for (const event of existing) bySeq.set(event.seq, event);
  let changed = false;
  for (const event of incoming) {
    if (!bySeq.has(event.seq)) {
      bySeq.set(event.seq, event);
      changed = true;
    }
  }
  if (!changed) return existing;
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}
