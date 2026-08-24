import { genId, nowIso, type Incident } from "@aegis/shared";
import { getHeroIncident } from "@aegis/simulator";
import { z } from "zod";
import {
  ChainSchema,
  IncidentTypeSchema,
  SeveritySchema,
} from "@aegis/shared";

/**
 * Incident creation input. Everything is optional: an empty body creates the
 * deterministic hero incident (fresh id), and any provided field overrides it.
 * This keeps the demo reproducible while allowing custom incidents.
 */
export const CreateIncidentSchema = z.object({
  type: IncidentTypeSchema.optional(),
  severity: SeveritySchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  affectedProtocol: z.string().min(1).optional(),
  chain: ChainSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;

export function buildIncident(input: CreateIncidentInput): Incident {
  const base = getHeroIncident();
  return {
    id: genId("INC"),
    type: input.type ?? base.type,
    severity: input.severity ?? base.severity,
    title: input.title ?? base.title,
    description: input.description ?? base.description,
    affectedProtocol: input.affectedProtocol ?? base.affectedProtocol,
    chain: input.chain ?? base.chain,
    detectedAt: nowIso(),
    status: "DETECTED",
    metadata: { ...base.metadata, ...(input.metadata ?? {}) },
  };
}
