import {
  getInvestigation,
  getRootCause,
  listAgents,
  listEvidenceRows,
  listFindings,
  listTimeline,
  listTools,
  type Database,
} from "@aegis/database";
import { err, ok } from "@aegis/shared";
import type { FastifyInstance } from "fastify";

/**
 * Rich investigation sub-resources — every response is derived from real
 * persisted rows (investigator_runs, agent_events, findings, evidence).
 */
export function registerInvestigationRoutes(app: FastifyInstance, db: Database): void {
  const base = "/api/v1/investigations";

  app.get<{ Params: { id: string } }>(`${base}/:id/agents`, async (req, reply) => {
    const inv = await getInvestigation(db, req.params.id);
    if (!inv) {
      reply.code(404).send(err("NOT_FOUND", "Investigation not found"));
      return;
    }
    reply.send(ok({ agents: await listAgents(db, req.params.id) }));
  });

  app.get<{ Params: { id: string } }>(`${base}/:id/tools`, async (req, reply) => {
    const inv = await getInvestigation(db, req.params.id);
    if (!inv) {
      reply.code(404).send(err("NOT_FOUND", "Investigation not found"));
      return;
    }
    reply.send(ok({ tools: await listTools(db, req.params.id) }));
  });

  app.get<{ Params: { id: string } }>(`${base}/:id/evidence`, async (req, reply) => {
    const inv = await getInvestigation(db, req.params.id);
    if (!inv) {
      reply.code(404).send(err("NOT_FOUND", "Investigation not found"));
      return;
    }
    const rows = await listEvidenceRows(db, req.params.id);
    reply.send(
      ok({
        evidence: rows.map((e) => ({
          id: e.id,
          source: e.source,
          type: e.type,
          reference: e.reference,
          observation: e.observation,
          timestamp: e.timestamp,
          metadata: e.metadata,
        })),
      }),
    );
  });

  app.get<{ Params: { id: string } }>(`${base}/:id/timeline`, async (req, reply) => {
    const inv = await getInvestigation(db, req.params.id);
    if (!inv) {
      reply.code(404).send(err("NOT_FOUND", "Investigation not found"));
      return;
    }
    reply.send(ok({ timeline: await listTimeline(db, req.params.id) }));
  });

  // Enriched investigation view (agents + findings + evidence + root cause).
  app.get<{ Params: { id: string } }>(`${base}/:id/full`, async (req, reply) => {
    const investigation = await getInvestigation(db, req.params.id).catch(() => null);
    if (!investigation) {
      reply.code(404).send(err("NOT_FOUND", "Investigation not found"));
      return;
    }
    const [agents, findings, evidence, rootCause] = await Promise.all([
      listAgents(db, investigation.id),
      listFindings(db, investigation.id),
      listEvidenceRows(db, investigation.id),
      getRootCause(db, investigation.id),
    ]);
    reply.send(
      ok({
        investigation,
        status: investigation.status,
        stage: investigation.stage,
        startedAt: investigation.startedAt,
        completedAt: investigation.completedAt,
        approvalState: investigation.approvalState,
        agents,
        findings,
        evidence,
        rootCause,
      }),
    );
  });
}
