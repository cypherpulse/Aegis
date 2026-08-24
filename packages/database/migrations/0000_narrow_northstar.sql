CREATE TABLE "agent_events" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"investigation_id" text,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"reference" text NOT NULL,
	"observation" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"investigator" text NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL,
	"confidence" double precision NOT NULL,
	"severity" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"affected_protocol" text NOT NULL,
	"chain" jsonb NOT NULL,
	"status" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"session_id" text,
	"status" text NOT NULL,
	"stage" text NOT NULL,
	"approval_state" text DEFAULT 'NOT_REQUIRED' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigator_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"investigator" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "root_causes" (
	"id" text PRIMARY KEY NOT NULL,
	"investigation_id" text NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"confidence" double precision NOT NULL,
	"severity" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contributing_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigator_runs" ADD CONSTRAINT "investigator_runs_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_causes" ADD CONSTRAINT "root_causes_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_incident_idx" ON "agent_events" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "agent_events_investigation_idx" ON "agent_events" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "agent_events_seq_idx" ON "agent_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "agent_events_timestamp_idx" ON "agent_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "evidence_investigation_idx" ON "evidence" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "findings_investigation_idx" ON "findings" USING btree ("investigation_id");--> statement-breakpoint
CREATE INDEX "investigations_incident_idx" ON "investigations" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investigations_one_active_per_incident" ON "investigations" USING btree ("incident_id") WHERE "investigations"."status" in ('QUEUED', 'RUNNING');--> statement-breakpoint
CREATE INDEX "investigator_runs_investigation_idx" ON "investigator_runs" USING btree ("investigation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "root_causes_investigation_uq" ON "root_causes" USING btree ("investigation_id");