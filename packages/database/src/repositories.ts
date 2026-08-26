import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  genId,
  nowIso,
  type AgentEvent,
  type Evidence,
  type Incident,
  type IncidentStatus,
  type InvestigationFinding,
  type InvestigationStage,
  type InvestigationStatus,
  type RootCause,
} from "@aegis/shared";
import type { Database } from "./client.js";
import {
  agentEvents,
  evidence as evidenceTable,
  findings as findingsTable,
  incidents,
  investigations,
  investigatorRuns,
  rootCauses,
} from "./schema.js";

export interface InvestigationRecord {
  id: string;
  incidentId: string;
  sessionId: string | null;
  status: InvestigationStatus;
  stage: InvestigationStage;
  approvalState: string;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

// ---- Incidents -----------------------------------------------------------

export async function createIncident(
  db: Database,
  incident: Incident,
  protocolId?: string | null,
  createdByUserId?: string | null,
): Promise<Incident> {
  await db.insert(incidents).values({
    id: incident.id,
    protocolId: protocolId ?? null,
    createdByUserId: createdByUserId ?? null,
    type: incident.type,
    severity: incident.severity,
    title: incident.title,
    description: incident.description,
    affectedProtocol: incident.affectedProtocol,
    chain: incident.chain,
    status: incident.status,
    detectedAt: incident.detectedAt,
    metadata: incident.metadata,
  });
  return incident;
}

function rowToIncident(r: typeof incidents.$inferSelect): Incident {
  return {
    id: r.id,
    type: r.type as Incident["type"],
    severity: r.severity as Incident["severity"],
    title: r.title,
    description: r.description,
    affectedProtocol: r.affectedProtocol,
    chain: r.chain as Incident["chain"],
    status: r.status as IncidentStatus,
    detectedAt: r.detectedAt,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  };
}

export async function getIncident(
  db: Database,
  id: string,
): Promise<Incident | null> {
  const rows = await db.select().from(incidents).where(eq(incidents.id, id));
  const r = rows[0];
  return r ? rowToIncident(r) : null;
}

/** Ownership fields for access control (null row = incident not found). */
export async function getIncidentOwner(
  db: Database,
  id: string,
): Promise<{ protocolId: string | null; createdByUserId: string | null } | null> {
  const rows = await db
    .select({ protocolId: incidents.protocolId, createdByUserId: incidents.createdByUserId })
    .from(incidents)
    .where(eq(incidents.id, id));
  return rows[0] ?? null;
}

export interface ListIncidentsFilter {
  status?: string | undefined;
  severity?: string | undefined;
  chain?: string | undefined;
  protocolId?: string | undefined;
  /**
   * Owner scope: return incidents the user created OR that belong to one of
   * their protocols. Used to isolate data per logged-in user.
   */
  ownerUserId?: string | undefined;
  ownerProtocolIds?: string[] | undefined;
  /** Public demo pool only: incidents with no owner and no protocol. */
  publicOnly?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function listIncidents(
  db: Database,
  filter: ListIncidentsFilter = {},
): Promise<{ items: Incident[]; total: number; offset: number; limit: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
  const offset = Math.max(filter.offset ?? 0, 0);
  const conds = [];
  if (filter.status) conds.push(eq(incidents.status, filter.status));
  if (filter.severity) conds.push(eq(incidents.severity, filter.severity));
  if (filter.protocolId) conds.push(eq(incidents.protocolId, filter.protocolId));
  if (filter.chain)
    conds.push(sql`${incidents.chain}->>'name' = ${filter.chain}`);
  // Per-user isolation: the user's own incidents plus those of their protocols.
  if (filter.ownerUserId) {
    const ownerConds = [eq(incidents.createdByUserId, filter.ownerUserId)];
    if (filter.ownerProtocolIds && filter.ownerProtocolIds.length > 0) {
      ownerConds.push(inArray(incidents.protocolId, filter.ownerProtocolIds));
    }
    conds.push(or(...ownerConds)!);
  } else if (filter.publicOnly) {
    conds.push(and(isNull(incidents.createdByUserId), isNull(incidents.protocolId))!);
  }
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(incidents)
    .where(where)
    .orderBy(desc(incidents.createdAt))
    .limit(limit)
    .offset(offset);

  const counted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(incidents)
    .where(where);

  return {
    items: rows.map(rowToIncident),
    total: counted[0]?.n ?? 0,
    offset,
    limit,
  };
}

export async function updateIncidentStatus(
  db: Database,
  id: string,
  status: IncidentStatus,
): Promise<void> {
  await db
    .update(incidents)
    .set({ status, updatedAt: nowIso() })
    .where(eq(incidents.id, id));
}

// ---- Investigations ------------------------------------------------------

function rowToInvestigation(
  r: typeof investigations.$inferSelect,
): InvestigationRecord {
  return {
    id: r.id,
    incidentId: r.incidentId,
    sessionId: r.sessionId,
    status: r.status as InvestigationStatus,
    stage: r.stage as InvestigationStage,
    approvalState: r.approvalState,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    failureReason: r.failureReason,
  };
}

export async function createInvestigation(
  db: Database,
  params: { incidentId: string; sessionId?: string | null },
): Promise<InvestigationRecord> {
  const id = genId("inv");
  const rows = await db
    .insert(investigations)
    .values({
      id,
      incidentId: params.incidentId,
      sessionId: params.sessionId ?? null,
      status: "QUEUED",
      stage: "CREATED",
    })
    .returning();
  return rowToInvestigation(rows[0]!);
}

export async function getInvestigation(
  db: Database,
  id: string,
): Promise<InvestigationRecord | null> {
  const rows = await db
    .select()
    .from(investigations)
    .where(eq(investigations.id, id));
  return rows[0] ? rowToInvestigation(rows[0]) : null;
}

export async function getLatestInvestigation(
  db: Database,
  incidentId: string,
): Promise<InvestigationRecord | null> {
  const rows = await db
    .select()
    .from(investigations)
    .where(eq(investigations.incidentId, incidentId))
    .orderBy(desc(investigations.createdAt))
    .limit(1);
  return rows[0] ? rowToInvestigation(rows[0]) : null;
}

export async function getActiveInvestigation(
  db: Database,
  incidentId: string,
): Promise<InvestigationRecord | null> {
  const rows = await db
    .select()
    .from(investigations)
    .where(
      and(
        eq(investigations.incidentId, incidentId),
        inArray(investigations.status, ["QUEUED", "RUNNING"]),
      ),
    );
  return rows[0] ? rowToInvestigation(rows[0]) : null;
}

export async function updateInvestigation(
  db: Database,
  id: string,
  patch: Partial<{
    status: InvestigationStatus;
    stage: InvestigationStage;
    sessionId: string;
    approvalState: string;
    startedAt: string;
    completedAt: string;
    failureReason: string;
  }>,
): Promise<void> {
  await db
    .update(investigations)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(investigations.id, id));
}

// ---- Investigator runs ---------------------------------------------------

export async function createInvestigatorRun(
  db: Database,
  params: { investigationId: string; investigator: string },
): Promise<string> {
  const id = genId("run");
  await db.insert(investigatorRuns).values({
    id,
    investigationId: params.investigationId,
    investigator: params.investigator,
    status: "RUNNING",
    startedAt: nowIso(),
  });
  return id;
}

export async function updateInvestigatorRun(
  db: Database,
  id: string,
  patch: Partial<{
    status: string;
    completedAt: string;
    failureReason: string;
  }>,
): Promise<void> {
  await db.update(investigatorRuns).set(patch).where(eq(investigatorRuns.id, id));
}

export async function listInvestigatorRuns(
  db: Database,
  investigationId: string,
) {
  return db
    .select()
    .from(investigatorRuns)
    .where(eq(investigatorRuns.investigationId, investigationId));
}

// ---- Findings + evidence -------------------------------------------------

export async function saveFinding(
  db: Database,
  investigationId: string,
  finding: InvestigationFinding,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(findingsTable).values({
      id: genId("fnd"),
      investigationId,
      investigator: finding.investigator,
      summary: finding.summary,
      status: finding.status,
      confidence: finding.confidence,
      severity: finding.severity,
      evidence: finding.evidence,
      metadata: finding.metadata,
    });
    if (finding.evidence.length > 0) {
      await tx.insert(evidenceTable).values(
        finding.evidence.map((e) => ({
          id: genId("ev"),
          investigationId,
          source: e.source,
          type: e.type,
          reference: e.reference,
          observation: e.observation,
          timestamp: e.timestamp,
        })),
      );
    }
  });
}

export async function listFindings(
  db: Database,
  investigationId: string,
): Promise<InvestigationFinding[]> {
  const rows = await db
    .select()
    .from(findingsTable)
    .where(eq(findingsTable.investigationId, investigationId));
  return rows.map((r) => ({
    investigator: r.investigator as InvestigationFinding["investigator"],
    status: r.status as InvestigationFinding["status"],
    summary: r.summary,
    evidence: (r.evidence ?? []) as Evidence[],
    confidence: r.confidence,
    severity: r.severity as InvestigationFinding["severity"],
    timestamp: r.createdAt,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  }));
}

// ---- Root cause ----------------------------------------------------------

export async function saveRootCause(
  db: Database,
  investigationId: string,
  rc: RootCause,
): Promise<void> {
  await db
    .insert(rootCauses)
    .values({
      id: genId("rc"),
      investigationId,
      title: rc.title,
      explanation: rc.explanation,
      confidence: rc.confidence,
      severity: rc.severity,
      evidence: rc.evidence,
      contributingFactors: rc.contributingFactors,
      status: rc.status,
    })
    .onConflictDoNothing({ target: rootCauses.investigationId });
}

export async function getRootCause(
  db: Database,
  investigationId: string,
): Promise<RootCause | null> {
  const rows = await db
    .select()
    .from(rootCauses)
    .where(eq(rootCauses.investigationId, investigationId));
  const r = rows[0];
  if (!r) return null;
  const inc = await db
    .select({ incidentId: investigations.incidentId })
    .from(investigations)
    .where(eq(investigations.id, investigationId));
  return {
    incidentId: inc[0]?.incidentId ?? "",
    title: r.title,
    explanation: r.explanation,
    confidence: r.confidence,
    severity: r.severity as RootCause["severity"],
    evidence: (r.evidence ?? []) as Evidence[],
    contributingFactors: (r.contributingFactors ??
      []) as RootCause["contributingFactors"],
    status: r.status as RootCause["status"],
    generatedAt: r.createdAt,
  };
}

// ---- Agent events --------------------------------------------------------

export async function appendAgentEvent(
  db: Database,
  event: AgentEvent,
  investigationId?: string | null,
): Promise<number> {
  const rows = await db
    .insert(agentEvents)
    .values({
      id: event.id,
      incidentId: event.incidentId,
      investigationId: investigationId ?? null,
      type: event.type,
      actor: event.actor,
      payload: event.payload,
      timestamp: event.timestamp,
    })
    .returning({ seq: agentEvents.seq });
  return rows[0]?.seq ?? 0;
}

export interface StoredEvent extends AgentEvent {
  seq: number;
}

export async function getAgentEvents(
  db: Database,
  incidentId: string,
  opts: { afterSeq?: number; limit?: number } = {},
): Promise<StoredEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const conds = [eq(agentEvents.incidentId, incidentId)];
  if (opts.afterSeq !== undefined)
    conds.push(gt(agentEvents.seq, opts.afterSeq));
  const rows = await db
    .select()
    .from(agentEvents)
    .where(and(...conds))
    .orderBy(agentEvents.seq)
    .limit(limit);
  return rows.map((r) => ({
    seq: r.seq,
    id: r.id,
    incidentId: r.incidentId,
    timestamp: r.timestamp,
    type: r.type as AgentEvent["type"],
    actor: r.actor,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}
