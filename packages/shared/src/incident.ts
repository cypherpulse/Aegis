import { z } from "zod";

/** Severity ranking shared across incidents and findings. */
export const SeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Phase 1 implements exactly one deterministic incident type.
 * Additional types are intentionally out of scope until later phases.
 */
export const IncidentTypeSchema = z.enum(["TREASURY_GAS_DEPLETION"]);
export type IncidentType = z.infer<typeof IncidentTypeSchema>;

/** Chain identity. Base Sepolia is the Phase 1 primary chain. */
export const ChainSchema = z.object({
  name: z.string().min(1),
  chainId: z.number().int().positive(),
});
export type Chain = z.infer<typeof ChainSchema>;

/**
 * The Phase 1 incident lifecycle. Statuses map directly onto the
 * orchestration stages in the Incident Commander; no extras.
 */
export const IncidentStatusSchema = z.enum([
  "DETECTED",
  "INVESTIGATING",
  "FUSION_IN_PROGRESS",
  "INVESTIGATION_COMPLETE",
  "FAILED",
]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentSchema = z.object({
  id: z.string().min(1),
  type: IncidentTypeSchema,
  severity: SeveritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  affectedProtocol: z.string().min(1),
  chain: ChainSchema,
  detectedAt: z.string().datetime(),
  status: IncidentStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Incident = z.infer<typeof IncidentSchema>;

/** Parse + validate an unknown value into an Incident, throwing on failure. */
export function parseIncident(input: unknown): Incident {
  return IncidentSchema.parse(input);
}

/** Non-throwing validation for API boundaries. */
export function safeParseIncident(input: unknown) {
  return IncidentSchema.safeParse(input);
}
