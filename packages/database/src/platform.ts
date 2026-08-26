import { and, desc, eq, gt, inArray, like, or, sql } from "drizzle-orm";
import { genId, nowIso } from "@aegis/shared";
import type { Database } from "./client.js";
import {
  contracts,
  integrationKeys,
  monitoringConfigs,
  protocolMembers,
  protocols,
  sessions,
  treasuryAddresses,
  users,
  walletNonces,
  agentEvents,
  findings as findingsTable,
  evidence as evidenceTable,
  investigatorRuns,
  incidents,
} from "./schema.js";

// ---- Records ------------------------------------------------------------

export type UserRecord = typeof users.$inferSelect;
export type ProtocolRecord = typeof protocols.$inferSelect;
export type ContractRecord = typeof contracts.$inferSelect;
export type TreasuryRecord = typeof treasuryAddresses.$inferSelect;
export type MonitoringRecord = typeof monitoringConfigs.$inferSelect;
export type IntegrationKeyRecord = typeof integrationKeys.$inferSelect;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// ---- Users --------------------------------------------------------------

export async function upsertWalletUser(
  db: Database,
  address: string,
): Promise<UserRecord> {
  const lower = address.toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, lower));
  if (existing[0]) return existing[0];
  const rows = await db
    .insert(users)
    .values({ id: genId("usr"), authProvider: "wallet", walletAddress: lower })
    .returning();
  return rows[0]!;
}

export async function upsertGoogleUser(
  db: Database,
  params: { email: string; displayName?: string },
): Promise<UserRecord> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, params.email));
  if (existing[0]) return existing[0];
  const rows = await db
    .insert(users)
    .values({
      id: genId("usr"),
      authProvider: "google",
      email: params.email,
      displayName: params.displayName ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function getUser(db: Database, id: string): Promise<UserRecord | null> {
  const rows = await db.select().from(users).where(eq(users.id, id));
  return rows[0] ?? null;
}

/** Idempotent seeded dev user (used only when AUTH_REQUIRED is off). */
export async function ensureDevUser(db: Database): Promise<UserRecord> {
  const id = "usr_dev";
  const rows = await db.select().from(users).where(eq(users.id, id));
  if (rows[0]) return rows[0];
  const created = await db
    .insert(users)
    .values({ id, authProvider: "wallet", displayName: "Dev User" })
    .onConflictDoNothing()
    .returning();
  return created[0] ?? (await getUser(db, id))!;
}

// ---- Sessions + nonces --------------------------------------------------

export async function createSession(
  db: Database,
  userId: string,
  ttlMs: number,
): Promise<{ id: string; expiresAt: string }> {
  const id = genId("sess");
  const expiresAt = iso(ttlMs);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function getSessionUser(
  db: Database,
  sessionId: string,
): Promise<UserRecord | null> {
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, nowIso())));
  return rows[0]?.user ?? null;
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function setNonce(
  db: Database,
  address: string,
  nonce: string,
  ttlMs: number,
): Promise<void> {
  const lower = address.toLowerCase();
  await db
    .insert(walletNonces)
    .values({ address: lower, nonce, expiresAt: iso(ttlMs) })
    .onConflictDoUpdate({
      target: walletNonces.address,
      set: { nonce, expiresAt: iso(ttlMs) },
    });
}

export async function consumeNonce(
  db: Database,
  address: string,
): Promise<string | null> {
  const lower = address.toLowerCase();
  const rows = await db
    .select()
    .from(walletNonces)
    .where(and(eq(walletNonces.address, lower), gt(walletNonces.expiresAt, nowIso())));
  const row = rows[0];
  if (!row) return null;
  await db.delete(walletNonces).where(eq(walletNonces.address, lower));
  return row.nonce;
}

// ---- Protocols + membership --------------------------------------------

export interface CreateProtocolInput {
  ownerUserId: string;
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  primaryChain?: string | null;
  githubRepository?: string | null;
}

export async function createProtocol(
  db: Database,
  input: CreateProtocolInput,
): Promise<ProtocolRecord> {
  return db.transaction(async (tx) => {
    const id = genId("proto");
    const rows = await tx
      .insert(protocols)
      .values({
        id,
        ownerUserId: input.ownerUserId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        website: input.website ?? null,
        primaryChain: input.primaryChain ?? null,
        githubRepository: input.githubRepository ?? null,
      })
      .returning();
    await tx.insert(protocolMembers).values({
      id: genId("pm"),
      protocolId: id,
      userId: input.ownerUserId,
      role: "OWNER",
    });
    await tx.insert(monitoringConfigs).values({ protocolId: id });
    return rows[0]!;
  });
}

export async function slugExists(db: Database, slug: string): Promise<boolean> {
  const rows = await db.select({ id: protocols.id }).from(protocols).where(eq(protocols.slug, slug));
  return rows.length > 0;
}

export async function listProtocolsForUser(
  db: Database,
  userId: string,
  opts: { limit?: number; offset?: number; includeArchived?: boolean } = {},
): Promise<{ items: ProtocolRecord[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const memberProtocolIds = db
    .select({ protocolId: protocolMembers.protocolId })
    .from(protocolMembers)
    .where(eq(protocolMembers.userId, userId));
  const scope = opts.includeArchived
    ? inArray(protocols.id, memberProtocolIds)
    : and(inArray(protocols.id, memberProtocolIds), eq(protocols.status, "ACTIVE"));
  const items = await db
    .select()
    .from(protocols)
    .where(scope)
    .orderBy(desc(protocols.createdAt))
    .limit(limit)
    .offset(offset);
  const counted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(protocols)
    .where(scope);
  return { items, total: counted[0]?.n ?? 0, limit, offset };
}

/** All protocol ids the user is a member of (active + archived), for scoping. */
export async function listUserProtocolIds(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ protocolId: protocolMembers.protocolId })
    .from(protocolMembers)
    .where(eq(protocolMembers.userId, userId));
  return rows.map((r) => r.protocolId);
}

export async function getProtocol(db: Database, id: string): Promise<ProtocolRecord | null> {
  const rows = await db.select().from(protocols).where(eq(protocols.id, id));
  return rows[0] ?? null;
}

export async function userHasProtocolAccess(
  db: Database,
  userId: string,
  protocolId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: protocolMembers.id })
    .from(protocolMembers)
    .where(and(eq(protocolMembers.protocolId, protocolId), eq(protocolMembers.userId, userId)));
  return rows.length > 0;
}

export async function updateProtocol(
  db: Database,
  id: string,
  patch: Partial<Pick<ProtocolRecord, "name" | "description" | "website" | "primaryChain" | "githubRepository">>,
): Promise<ProtocolRecord | null> {
  const rows = await db
    .update(protocols)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(protocols.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Soft-archive: hides the protocol and pauses its monitoring, keeps history. */
export async function archiveProtocol(db: Database, id: string): Promise<ProtocolRecord | null> {
  const rows = await db
    .update(protocols)
    .set({ status: "ARCHIVED", archivedAt: nowIso(), updatedAt: nowIso() })
    .where(eq(protocols.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function unarchiveProtocol(db: Database, id: string): Promise<ProtocolRecord | null> {
  const rows = await db
    .update(protocols)
    .set({ status: "ACTIVE", archivedAt: null, updatedAt: nowIso() })
    .where(eq(protocols.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Permanent delete: removes the protocol + config; its incidents are kept as
 * owner-scoped history (protocol link cleared so they don't leak as public). */
export async function deleteProtocol(db: Database, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(incidents).set({ protocolId: null }).where(eq(incidents.protocolId, id));
    await tx.delete(integrationKeys).where(eq(integrationKeys.protocolId, id));
    await tx.delete(contracts).where(eq(contracts.protocolId, id));
    await tx.delete(treasuryAddresses).where(eq(treasuryAddresses.protocolId, id));
    await tx.delete(monitoringConfigs).where(eq(monitoringConfigs.protocolId, id));
    await tx.delete(protocolMembers).where(eq(protocolMembers.protocolId, id));
    await tx.delete(protocols).where(eq(protocols.id, id));
  });
}

// ---- Contracts ----------------------------------------------------------

export async function createContract(
  db: Database,
  input: {
    protocolId: string;
    name: string;
    chain: string;
    address: string;
    type?: string | undefined;
    status?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  },
): Promise<ContractRecord> {
  const rows = await db
    .insert(contracts)
    .values({
      id: genId("ctr"),
      protocolId: input.protocolId,
      name: input.name,
      chain: input.chain,
      address: input.address,
      type: input.type ?? "UNKNOWN",
      status: input.status ?? "ACTIVE",
      metadata: input.metadata ?? {},
    })
    .returning();
  return rows[0]!;
}

export async function listContracts(db: Database, protocolId: string): Promise<ContractRecord[]> {
  return db.select().from(contracts).where(eq(contracts.protocolId, protocolId)).orderBy(desc(contracts.createdAt));
}

export async function getContract(db: Database, id: string): Promise<ContractRecord | null> {
  const rows = await db.select().from(contracts).where(eq(contracts.id, id));
  return rows[0] ?? null;
}

export async function updateContract(
  db: Database,
  id: string,
  patch: Partial<Pick<ContractRecord, "name" | "type" | "status">> & { metadata?: Record<string, unknown> },
): Promise<ContractRecord | null> {
  const rows = await db.update(contracts).set({ ...patch, updatedAt: nowIso() }).where(eq(contracts.id, id)).returning();
  return rows[0] ?? null;
}

export async function deleteContract(db: Database, id: string): Promise<void> {
  await db.delete(contracts).where(eq(contracts.id, id));
}

// ---- Treasury -----------------------------------------------------------

export async function createTreasury(
  db: Database,
  input: {
    protocolId: string;
    address: string;
    chain: string;
    label?: string | undefined;
    status?: string | undefined;
  },
): Promise<TreasuryRecord> {
  const rows = await db
    .insert(treasuryAddresses)
    .values({
      id: genId("tre"),
      protocolId: input.protocolId,
      address: input.address,
      chain: input.chain,
      label: input.label ?? null,
      status: input.status ?? "ACTIVE",
    })
    .returning();
  return rows[0]!;
}

export async function listTreasury(db: Database, protocolId: string): Promise<TreasuryRecord[]> {
  return db.select().from(treasuryAddresses).where(eq(treasuryAddresses.protocolId, protocolId)).orderBy(desc(treasuryAddresses.createdAt));
}

export async function getTreasury(db: Database, id: string): Promise<TreasuryRecord | null> {
  const rows = await db.select().from(treasuryAddresses).where(eq(treasuryAddresses.id, id));
  return rows[0] ?? null;
}

export async function updateTreasury(
  db: Database,
  id: string,
  patch: Partial<Pick<TreasuryRecord, "label" | "status">>,
): Promise<TreasuryRecord | null> {
  const rows = await db.update(treasuryAddresses).set({ ...patch, updatedAt: nowIso() }).where(eq(treasuryAddresses.id, id)).returning();
  return rows[0] ?? null;
}

export async function deleteTreasury(db: Database, id: string): Promise<void> {
  await db.delete(treasuryAddresses).where(eq(treasuryAddresses.id, id));
}

// ---- Monitoring ---------------------------------------------------------

export async function getMonitoring(db: Database, protocolId: string): Promise<MonitoringRecord> {
  const rows = await db.select().from(monitoringConfigs).where(eq(monitoringConfigs.protocolId, protocolId));
  if (rows[0]) return rows[0];
  const created = await db.insert(monitoringConfigs).values({ protocolId }).onConflictDoNothing().returning();
  return created[0] ?? rows[0]!;
}

/** Active (non-archived) protocols with any monitoring flag enabled. */
export async function listMonitoredProtocols(
  db: Database,
): Promise<MonitoringRecord[]> {
  const activeIds = db
    .select({ id: protocols.id })
    .from(protocols)
    .where(eq(protocols.status, "ACTIVE"));
  const rows = await db
    .select()
    .from(monitoringConfigs)
    .where(
      and(
        inArray(monitoringConfigs.protocolId, activeIds),
        or(
          eq(monitoringConfigs.contractMonitoring, true),
          eq(monitoringConfigs.treasuryMonitoring, true),
          eq(monitoringConfigs.applicationMonitoring, true),
        ),
      ),
    );
  return rows;
}

export async function updateMonitoring(
  db: Database,
  protocolId: string,
  patch: Partial<Pick<MonitoringRecord, "contractMonitoring" | "treasuryMonitoring" | "applicationMonitoring">> & { config?: Record<string, unknown> },
): Promise<MonitoringRecord> {
  await getMonitoring(db, protocolId); // ensure exists
  const rows = await db.update(monitoringConfigs).set({ ...patch, updatedAt: nowIso() }).where(eq(monitoringConfigs.protocolId, protocolId)).returning();
  return rows[0]!;
}

// ---- Integration keys ---------------------------------------------------

export async function createIntegrationKey(
  db: Database,
  input: { protocolId: string; name: string; keyPrefix: string; keyHash: string },
): Promise<IntegrationKeyRecord> {
  const rows = await db
    .insert(integrationKeys)
    .values({ id: genId("ik"), protocolId: input.protocolId, name: input.name, keyPrefix: input.keyPrefix, keyHash: input.keyHash })
    .returning();
  return rows[0]!;
}

export async function listIntegrationKeys(db: Database, protocolId: string): Promise<IntegrationKeyRecord[]> {
  return db.select().from(integrationKeys).where(eq(integrationKeys.protocolId, protocolId)).orderBy(desc(integrationKeys.createdAt));
}

export async function getIntegrationKeyById(db: Database, id: string): Promise<IntegrationKeyRecord | null> {
  const rows = await db.select().from(integrationKeys).where(eq(integrationKeys.id, id));
  return rows[0] ?? null;
}

export async function getIntegrationKeyByPrefix(db: Database, prefix: string): Promise<IntegrationKeyRecord | null> {
  const rows = await db
    .select()
    .from(integrationKeys)
    .where(and(eq(integrationKeys.keyPrefix, prefix), sql`${integrationKeys.revokedAt} is null`));
  return rows[0] ?? null;
}

export async function touchIntegrationKey(db: Database, id: string): Promise<void> {
  await db.update(integrationKeys).set({ lastUsedAt: nowIso() }).where(eq(integrationKeys.id, id));
}

export async function revokeIntegrationKey(db: Database, id: string): Promise<void> {
  await db.update(integrationKeys).set({ revokedAt: nowIso() }).where(eq(integrationKeys.id, id));
}

// ---- Investigation-derived views (real persisted rows) ------------------

export async function listEvidenceRows(db: Database, investigationId: string) {
  return db
    .select()
    .from(evidenceTable)
    .where(eq(evidenceTable.investigationId, investigationId))
    .orderBy(evidenceTable.createdAt);
}

const INVESTIGATOR_ACTOR: Record<string, string> = {
  BLOCKCHAIN: "blockchain-investigator",
  TREASURY: "treasury-investigator",
  APPLICATION: "application-investigator",
  CODE: "code-investigator",
};

export interface AgentView {
  id: string;
  role: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  toolCalls: number;
  findings: number;
}

export async function listAgents(db: Database, investigationId: string): Promise<AgentView[]> {
  const runs = await db.select().from(investigatorRuns).where(eq(investigatorRuns.investigationId, investigationId));
  const out: AgentView[] = [];
  for (const run of runs) {
    const actor = INVESTIGATOR_ACTOR[run.investigator] ?? run.investigator.toLowerCase();
    const toolCalls = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.investigationId, investigationId),
          eq(agentEvents.actor, actor),
          like(agentEvents.type, "%tool_called"),
        ),
      );
    const findingCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(findingsTable)
      .where(and(eq(findingsTable.investigationId, investigationId), eq(findingsTable.investigator, run.investigator)));
    out.push({
      id: run.id,
      role: `${run.investigator}_INVESTIGATOR`,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      toolCalls: toolCalls[0]?.n ?? 0,
      findings: findingCount[0]?.n ?? 0,
    });
  }
  return out;
}

export interface ToolView {
  toolName: string;
  agent: string;
  status: "called" | "completed";
  timestamp: string;
  durationMs: number | null;
  inputSummary: string | null;
}

export interface TimelineEntry {
  seq: number;
  type: string;
  actor: string;
  timestamp: string;
  summary: Record<string, unknown>;
}

export async function listTimeline(
  db: Database,
  investigationId: string,
): Promise<TimelineEntry[]> {
  const rows = await db
    .select()
    .from(agentEvents)
    .where(eq(agentEvents.investigationId, investigationId))
    .orderBy(agentEvents.seq);
  return rows.map((r) => ({
    seq: r.seq,
    type: r.type,
    actor: r.actor,
    timestamp: r.timestamp,
    summary: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

export async function listTools(db: Database, investigationId: string): Promise<ToolView[]> {
  const rows = await db
    .select()
    .from(agentEvents)
    .where(and(eq(agentEvents.investigationId, investigationId), like(agentEvents.type, "%tool_%")))
    .orderBy(agentEvents.seq);
  return rows
    .filter((r) => r.type.endsWith("tool_called") || r.type.endsWith("tool_completed"))
    .map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return {
        toolName: typeof p["tool"] === "string" ? (p["tool"] as string) : "unknown",
        agent: r.actor,
        status: r.type.endsWith("tool_completed") ? "completed" : "called",
        timestamp: r.timestamp,
        durationMs: typeof p["durationMs"] === "number" ? (p["durationMs"] as number) : null,
        inputSummary: p["input"] !== undefined ? JSON.stringify(p["input"]).slice(0, 200) : null,
      };
    });
}
