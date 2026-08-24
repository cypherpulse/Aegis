import { z } from "zod";
import { InvestigationFindingSchema, InvestigatorKindSchema } from "./finding.js";

/**
 * A signal that Evidence Fusion correlated across two or more investigators.
 * `supportingEvidence` holds evidence references so the original evidence is
 * always traceable.
 */
export const CorrelatedSignalSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  investigators: z.array(InvestigatorKindSchema).min(1),
  supportingEvidence: z.array(z.string()),
  weight: z.number().min(0).max(1),
});
export type CorrelatedSignal = z.infer<typeof CorrelatedSignalSchema>;

export const HypothesisSchema = z.object({
  title: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const UnifiedEvidenceStatusSchema = z.enum([
  "COMPLETE",
  "PARTIAL",
  "FAILED",
]);
export type UnifiedEvidenceStatus = z.infer<typeof UnifiedEvidenceStatusSchema>;

/** The deterministic output of Evidence Fusion. */
export const UnifiedEvidenceSchema = z.object({
  incidentId: z.string().min(1),
  findings: z.array(InvestigationFindingSchema),
  correlatedSignals: z.array(CorrelatedSignalSchema),
  hypothesis: HypothesisSchema,
  summary: z.string().min(1),
  status: UnifiedEvidenceStatusSchema,
  generatedAt: z.string().datetime(),
});
export type UnifiedEvidence = z.infer<typeof UnifiedEvidenceSchema>;

export function parseUnifiedEvidence(input: unknown): UnifiedEvidence {
  return UnifiedEvidenceSchema.parse(input);
}

export function safeParseUnifiedEvidence(input: unknown) {
  return UnifiedEvidenceSchema.safeParse(input);
}
