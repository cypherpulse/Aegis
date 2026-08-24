import { randomUUID } from "node:crypto";
import type { AgentEvent, AgentEventType } from "./events.js";

/** Short prefixed id, e.g. `evt_a1b2c3d4`. */
export function genId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Current time as an ISO-8601 string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Construct a validated-shape AgentEvent with generated id + timestamp. */
export function makeEvent(params: {
  incidentId: string;
  type: AgentEventType;
  actor: string;
  payload?: Record<string, unknown>;
}): AgentEvent {
  return {
    id: genId("evt"),
    incidentId: params.incidentId,
    timestamp: nowIso(),
    type: params.type,
    actor: params.actor,
    payload: params.payload ?? {},
  };
}

/** Round a confidence/weight to 2 decimals for stable, readable output. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
