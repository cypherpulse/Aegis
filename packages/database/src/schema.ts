import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const incidents = pgTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    // Nullable: protocol-scoped ingestion links an incident to a protocol.
    protocolId: text("protocol_id"),
    // Nullable: the user who created/owns this incident (null = public demo).
    createdByUserId: text("created_by_user_id"),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    affectedProtocol: text("affected_protocol").notNull(),
    chain: jsonb("chain").notNull(),
    status: text("status").notNull(),
    detectedAt: ts("detected_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    index("incidents_protocol_idx").on(t.protocolId),
    index("incidents_status_idx").on(t.status),
    index("incidents_created_by_idx").on(t.createdByUserId),
  ],
);

export const investigations = pgTable(
  "investigations",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id),
    sessionId: text("session_id"),
    status: text("status").notNull(),
    stage: text("stage").notNull(),
    approvalState: text("approval_state").notNull().default("NOT_REQUIRED"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    failureReason: text("failure_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("investigations_incident_idx").on(t.incidentId),
    // At most one active (QUEUED/RUNNING) investigation per incident (§28/§29).
    uniqueIndex("investigations_one_active_per_incident")
      .on(t.incidentId)
      .where(sql`${t.status} in ('QUEUED', 'RUNNING')`),
  ],
);

export const investigatorRuns = pgTable(
  "investigator_runs",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigations.id),
    investigator: text("investigator").notNull(),
    status: text("status").notNull(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    failureReason: text("failure_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("investigator_runs_investigation_idx").on(t.investigationId)],
);

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigations.id),
    investigator: text("investigator").notNull(),
    summary: text("summary").notNull(),
    status: text("status").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    severity: text("severity").notNull(),
    evidence: jsonb("evidence").notNull().default([]),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("findings_investigation_idx").on(t.investigationId)],
);

export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigations.id),
    source: text("source").notNull(),
    type: text("type").notNull(),
    reference: text("reference").notNull(),
    observation: text("observation").notNull(),
    timestamp: ts("timestamp").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("evidence_investigation_idx").on(t.investigationId)],
);

export const rootCauses = pgTable(
  "root_causes",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigations.id),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    severity: text("severity").notNull(),
    evidence: jsonb("evidence").notNull().default([]),
    contributingFactors: jsonb("contributing_factors").notNull().default([]),
    status: text("status").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("root_causes_investigation_uq").on(t.investigationId),
  ],
);

export const agentEvents = pgTable(
  "agent_events",
  {
    seq: bigserial("seq", { mode: "number" }).notNull(),
    id: text("id").primaryKey(),
    incidentId: text("incident_id").notNull(),
    investigationId: text("investigation_id"),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    payload: jsonb("payload").notNull().default({}),
    timestamp: ts("timestamp").notNull(),
  },
  (t) => [
    index("agent_events_incident_idx").on(t.incidentId),
    index("agent_events_investigation_idx").on(t.investigationId),
    index("agent_events_seq_idx").on(t.seq),
    index("agent_events_timestamp_idx").on(t.timestamp),
  ],
);

// ============================================================
// Platform resources (Phase: API expansion)
// ============================================================

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    authProvider: text("auth_provider").notNull(), // wallet | google
    walletAddress: text("wallet_address"),
    email: text("email"),
    displayName: text("display_name"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_wallet_uq").on(t.walletAddress),
    uniqueIndex("users_email_uq").on(t.email),
  ],
);

export const protocols = pgTable(
  "protocols",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    website: text("website"),
    primaryChain: text("primary_chain"),
    githubRepository: text("github_repository"),
    status: text("status").notNull().default("ACTIVE"),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("protocols_slug_uq").on(t.slug),
    index("protocols_owner_idx").on(t.ownerUserId),
    index("protocols_status_idx").on(t.status),
  ],
);

export const protocolMembers = pgTable(
  "protocol_members",
  {
    id: text("id").primaryKey(),
    protocolId: text("protocol_id")
      .notNull()
      .references(() => protocols.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("OWNER"), // OWNER | MEMBER
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("protocol_members_uq").on(t.protocolId, t.userId),
    index("protocol_members_user_idx").on(t.userId),
  ],
);

export const contracts = pgTable(
  "contracts",
  {
    id: text("id").primaryKey(),
    protocolId: text("protocol_id")
      .notNull()
      .references(() => protocols.id),
    name: text("name").notNull(),
    chain: text("chain").notNull(),
    address: text("address").notNull(),
    type: text("type").notNull().default("UNKNOWN"),
    status: text("status").notNull().default("ACTIVE"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("contracts_protocol_idx").on(t.protocolId)],
);

export const treasuryAddresses = pgTable(
  "treasury_addresses",
  {
    id: text("id").primaryKey(),
    protocolId: text("protocol_id")
      .notNull()
      .references(() => protocols.id),
    address: text("address").notNull(),
    chain: text("chain").notNull(),
    label: text("label"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("treasury_protocol_idx").on(t.protocolId)],
);

export const monitoringConfigs = pgTable("monitoring_configs", {
  protocolId: text("protocol_id")
    .primaryKey()
    .references(() => protocols.id),
  contractMonitoring: boolean("contract_monitoring").notNull().default(false),
  treasuryMonitoring: boolean("treasury_monitoring").notNull().default(false),
  applicationMonitoring: boolean("application_monitoring").notNull().default(false),
  config: jsonb("config").notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const integrationKeys = pgTable(
  "integration_keys",
  {
    id: text("id").primaryKey(),
    protocolId: text("protocol_id")
      .notNull()
      .references(() => protocols.id),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    lastUsedAt: ts("last_used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    index("integration_keys_protocol_idx").on(t.protocolId),
    index("integration_keys_prefix_idx").on(t.keyPrefix),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const walletNonces = pgTable("wallet_nonces", {
  address: text("address").primaryKey(),
  nonce: text("nonce").notNull(),
  expiresAt: ts("expires_at").notNull(),
});
