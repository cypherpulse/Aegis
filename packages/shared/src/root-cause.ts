import { z } from "zod";
import { EvidenceSchema } from "./finding.js";
import { SeveritySchema } from "./incident.js";

export const RootCauseStatusSchema = z.enum([
  "COMPLETE",
  "PARTIAL",
  "INSUFFICIENT_EVIDENCE",
  "FAILED",
]);
export type RootCauseStatus = z.infer<typeof RootCauseStatusSchema>;

export const ContributingFactorSchema = z.object({
  description: z.string().min(1),
  weight: z.number().min(0).max(1),
});
export type ContributingFactor = z.infer<typeof ContributingFactorSchema>;

/** Final root-cause analysis produced after Code Investigator + Sandbox. */
export const RootCauseSchema = z.object({
  incidentId: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string().min(1),
  confidence: z.number().min(0).max(1),
  severity: SeveritySchema,
  evidence: z.array(EvidenceSchema),
  contributingFactors: z.array(ContributingFactorSchema),
  status: RootCauseStatusSchema,
  generatedAt: z.string().datetime(),
});
export type RootCause = z.infer<typeof RootCauseSchema>;

export function parseRootCause(input: unknown): RootCause {
  return RootCauseSchema.parse(input);
}
