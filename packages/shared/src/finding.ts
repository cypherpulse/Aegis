import { z } from "zod";
import { SeveritySchema } from "./incident.js";

/** Specialist investigators. CODE is added in Phase 2. */
export const InvestigatorKindSchema = z.enum([
  "BLOCKCHAIN",
  "TREASURY",
  "APPLICATION",
  "CODE",
]);
export type InvestigatorKind = z.infer<typeof InvestigatorKindSchema>;

export const FindingStatusSchema = z.enum(["SUCCESS", "FAILED"]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

/**
 * A single machine-readable observation backing a finding. Evidence is never
 * discarded downstream — Evidence Fusion preserves all of it.
 */
export const EvidenceSchema = z.object({
  source: z.string().min(1),
  type: z.string().min(1),
  reference: z.string(),
  observation: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * Structured output every investigator must return. The application relies on
 * these fields, not on free-form model text.
 */
export const InvestigationFindingSchema = z.object({
  investigator: InvestigatorKindSchema,
  status: FindingStatusSchema,
  summary: z.string().min(1),
  evidence: z.array(EvidenceSchema),
  confidence: z.number().min(0).max(1),
  severity: SeveritySchema,
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type InvestigationFinding = z.infer<typeof InvestigationFindingSchema>;

export function parseFinding(input: unknown): InvestigationFinding {
  return InvestigationFindingSchema.parse(input);
}

export function safeParseFinding(input: unknown) {
  return InvestigationFindingSchema.safeParse(input);
}
