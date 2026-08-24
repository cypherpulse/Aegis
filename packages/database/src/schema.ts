import { sql } from "drizzle-orm";
import {
  bigserial,
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

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
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
});

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
