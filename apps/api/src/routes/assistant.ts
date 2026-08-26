import {
  createInvestigation,
  getActiveInvestigation,
  getIncident,
  getIncidentOwner,
  getLatestInvestigation,
  getRootCause,
  listFindings,
  listIncidents,
  listUserProtocolIds,
  type Database,
} from "@aegis/database";
import { TrueForgeSession } from "@aegis/trueforge";
import { err, genId, ok, type Incident } from "@aegis/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { authRequired, currentUser, requireUser } from "../auth.js";
import type { InvestigationJobRunner } from "../jobs.js";

const ChatBody = z.object({
  message: z.string().min(1).max(2000),
  incidentId: z.string().min(1).optional(),
});

const INCIDENT_ID = /INC_[a-f0-9]+/i;

/** Incidents visible to the acting user (per-user scope, or all in demo mode). */
async function scopedIncidents(db: Database, req: FastifyRequest, limit = 12) {
  if (!authRequired()) return (await listIncidents(db, { limit })).items;
  const actor = await currentUser(db, req);
  if (!actor) return (await listIncidents(db, { publicOnly: true, limit })).items;
  const ownerProtocolIds = await listUserProtocolIds(db, actor.id);
  return (await listIncidents(db, { ownerUserId: actor.id, ownerProtocolIds, limit })).items;
}

async function canView(
  db: Database,
  req: FastifyRequest,
  owner: { protocolId: string | null; createdByUserId: string | null },
): Promise<boolean> {
  if (!authRequired()) return true;
  if (!owner.createdByUserId && !owner.protocolId) return true;
  const actor = await currentUser(db, req);
  if (!actor) return false;
  if (owner.createdByUserId === actor.id) return true;
  if (owner.protocolId) return (await listUserProtocolIds(db, actor.id)).includes(owner.protocolId);
  return false;
}

/** Compact analysis of one incident from its persisted findings + root cause. */
async function incidentAnalysis(db: Database, incident: Incident): Promise<string> {
  const inv = await getLatestInvestigation(db, incident.id);
  const findings = inv ? await listFindings(db, inv.id) : [];
  const rc = inv ? await getRootCause(db, inv.id) : null;
  const lines = [
    `Incident ${incident.id}: "${incident.title}" — ${incident.severity} on ${incident.chain.name}, status ${incident.status}.`,
    incident.description ? `Description: ${incident.description}` : "",
    inv ? `Investigation ${inv.id}: status ${inv.status}, stage ${inv.stage}.` : "No investigation yet.",
  ];
  for (const f of findings) {
    lines.push(
      `- ${f.investigator} (${f.status}, confidence ${(f.confidence * 100).toFixed(0)}%): ${f.summary}`,
    );
  }
  if (rc) {
    lines.push(
      `Root cause (${rc.status}, confidence ${(rc.confidence * 100).toFixed(0)}%): ${rc.title} — ${rc.explanation}`,
    );
  }
  return lines.filter(Boolean).join("\n");
}

function incidentListSummary(items: Incident[]): string {
  if (items.length === 0) return "The user currently has no incidents.";
  return [
    `The user has ${items.length} recent incident(s):`,
    ...items.map(
      (i) => `- ${i.id} "${i.title}" — ${i.severity} on ${i.chain.name}, status ${i.status}`,
    ),
  ].join("\n");
}

/** A useful answer from the real data when the harness LLM is unavailable. */
function localReply(userMsg: string, context: string): string {
  return [
    "Working from your live Aegis data (the TrueForge agent was unavailable, so this is a direct data summary):",
    "",
    context,
    "",
    `You asked: "${userMsg}"`,
    "Ask me to analyze a specific incident (include its INC_ id) or to investigate one.",
  ].join("\n");
}

export function registerAssistantRoutes(
  app: FastifyInstance,
  db: Database,
  jobs: InvestigationJobRunner,
): void {
  const base = "/api/v1/assistant";

  app.post<{ Body: z.infer<typeof ChatBody> }>(
    `${base}/chat`,
    { schema: { body: ChatBody } },
    async (req, reply) => {
      await requireUser(db, req); // scope + auth
      const { message, incidentId } = req.body;
      const targetId = incidentId ?? message.match(INCIDENT_ID)?.[0];
      const wantsInvestigate = /\b(investigate|run|launch|start|re-?run)\b/i.test(message);

      const actions: Array<{ type: string; incidentId: string; investigationId?: string }> = [];
      let context: string;

      if (targetId) {
        const owner = await getIncidentOwner(db, targetId);
        if (!owner || !(await canView(db, req, owner))) {
          reply.code(404).send(err("NOT_FOUND", "Incident not found"));
          return;
        }
        const incident = (await getIncident(db, targetId))!;

        // Agentic action: launch a real investigation when asked.
        if (wantsInvestigate) {
          const existing = await getActiveInvestigation(db, incident.id);
          if (existing) {
            actions.push({ type: "investigation_active", incidentId: incident.id, investigationId: existing.id });
          } else {
            const investigation = await createInvestigation(db, { incidentId: incident.id });
            jobs.enqueue(incident, investigation.id);
            actions.push({ type: "investigation_started", incidentId: incident.id, investigationId: investigation.id });
          }
        }
        context = await incidentAnalysis(db, incident);
      } else {
        context = incidentListSummary(await scopedIncidents(db, req));
      }

      // Drive the deployed TrueForge agent (aegis-commander) for the answer.
      const convoId = genId("chat");
      const session = await TrueForgeSession.start({ incidentId: convoId, emit: () => {} });
      const prompt = [
        "You are Aegis Assistant, an expert blockchain incident-response analyst.",
        "Answer the user's question using ONLY the context below. Be concise, concrete,",
        "and cite incident IDs and evidence. Never invent data; if the context lacks",
        "something, say so. If an action was taken, acknowledge it.",
        "",
        "=== CONTEXT ===",
        context,
        actions.length ? `\nActions performed: ${JSON.stringify(actions)}` : "",
        "=== END CONTEXT ===",
        "",
        `User: ${message}`,
      ].join("\n");

      const modelText = await session.narrateTurn(prompt);
      const reply_text = modelText?.trim() || localReply(message, context);

      reply.send(
        ok({
          reply: reply_text,
          mode: session.mode,
          actions,
          ...(targetId ? { incidentId: targetId } : {}),
        }),
      );
    },
  );
}
