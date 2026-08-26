// SSE / stored-event types (Part IV.2 + Part V).

import type { InvestigationStatus, RootCauseStatus, Severity } from "./api";

export type AgentEventType =
  | "incident.created"
  | "investigation.started"
  | "session.created"
  | "commander.started"
  | "investigator.started"
  | "investigator.tool_called"
  | "investigator.tool_completed"
  | "investigator.completed"
  | "investigator.failed"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "approval.timeout"
  | "evidence.fusion_started"
  | "evidence.fusion_completed"
  | "code_investigator.started"
  | "code_investigator.tool_called"
  | "code_investigator.tool_completed"
  | "code_investigator.completed"
  | "code_investigator.failed"
  | "sandbox.started"
  | "sandbox.completed"
  | "sandbox.failed"
  | "sandbox.timeout"
  | "root_cause.started"
  | "root_cause.completed"
  | "investigation.completed"
  | "investigation.failed";

export interface StoredEvent {
  seq: number;
  id: string;
  incidentId: string;
  timestamp: string;
  type: AgentEventType;
  actor: string;
  payload: Record<string, unknown>;
}

export interface EventsResponse {
  items: StoredEvent[];
  nextCursor: string | null;
}

export type SessionMode = "harness" | "local";
export type SandboxDriver = "docker" | "subprocess";

// Narrow payload readers — payloads are Record<string, unknown> on the wire.
export function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" ? value : undefined;
}

export function readBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readStringArray(
  payload: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = payload[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

export function readSessionMode(payload: Record<string, unknown>): SessionMode | undefined {
  const mode = readString(payload, "mode");
  return mode === "harness" || mode === "local" ? mode : undefined;
}

export function readDriver(payload: Record<string, unknown>): SandboxDriver | undefined {
  const driver = readString(payload, "driver");
  return driver === "docker" || driver === "subprocess" ? driver : undefined;
}

export function readSeverity(payload: Record<string, unknown>): Severity | undefined {
  const value = readString(payload, "severity");
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL"
    ? value
    : undefined;
}

export function readInvestigationStatus(
  payload: Record<string, unknown>,
): InvestigationStatus | undefined {
  const v = readString(payload, "status");
  return v === "QUEUED" || v === "RUNNING" || v === "COMPLETE" || v === "PARTIAL" || v === "FAILED"
    ? v
    : undefined;
}

export function readRootCauseStatus(payload: Record<string, unknown>): RootCauseStatus | undefined {
  const v = readString(payload, "status");
  return v === "COMPLETE" || v === "PARTIAL" || v === "INSUFFICIENT_EVIDENCE" || v === "FAILED"
    ? v
    : undefined;
}
