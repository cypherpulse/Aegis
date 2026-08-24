import { z } from "zod";

/**
 * Structured agent events emitted throughout an investigation. These drive the
 * live UI timeline and the persisted audit trail. Payloads must never contain
 * secrets.
 *
 * The approval.* events back the human-in-the-loop "can be stopped" capability:
 * a sensitive tool call emits `approval.requested`, then resolves to
 * `approval.granted` / `approval.denied` / `approval.timeout`.
 */
export const AgentEventTypeSchema = z.enum([
  "incident.created",
  "investigation.started",
  "commander.started",
  "session.created",
  "investigator.started",
  "investigator.tool_called",
  "investigator.tool_completed",
  "investigator.completed",
  "investigator.failed",
  "approval.requested",
  "approval.granted",
  "approval.denied",
  "approval.timeout",
  "evidence.fusion_started",
  "evidence.fusion_completed",
  "code_investigator.started",
  "code_investigator.tool_called",
  "code_investigator.tool_completed",
  "code_investigator.completed",
  "code_investigator.failed",
  "sandbox.started",
  "sandbox.completed",
  "sandbox.failed",
  "sandbox.timeout",
  "root_cause.started",
  "root_cause.completed",
  "investigation.completed",
  "investigation.failed",
]);
export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const AgentEventSchema = z.object({
  id: z.string().min(1),
  incidentId: z.string().min(1),
  timestamp: z.string().datetime(),
  type: AgentEventTypeSchema,
  actor: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export function parseAgentEvent(input: unknown): AgentEvent {
  return AgentEventSchema.parse(input);
}
