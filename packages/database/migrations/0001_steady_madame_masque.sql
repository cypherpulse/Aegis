CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"protocol_id" text NOT NULL,
	"name" text NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"type" text DEFAULT 'UNKNOWN' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"protocol_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "monitoring_configs" (
	"protocol_id" text PRIMARY KEY NOT NULL,
	"contract_monitoring" boolean DEFAULT false NOT NULL,
	"treasury_monitoring" boolean DEFAULT false NOT NULL,
	"application_monitoring" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_members" (
	"id" text PRIMARY KEY NOT NULL,
	"protocol_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'OWNER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocols" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"website" text,
	"primary_chain" text,
	"github_repository" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"protocol_id" text NOT NULL,
	"address" text NOT NULL,
	"chain" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_provider" text NOT NULL,
	"wallet_address" text,
	"email" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_nonces" (
	"address" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "protocol_id" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_keys" ADD CONSTRAINT "integration_keys_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_configs" ADD CONSTRAINT "monitoring_configs_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_members" ADD CONSTRAINT "protocol_members_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_members" ADD CONSTRAINT "protocol_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_addresses" ADD CONSTRAINT "treasury_addresses_protocol_id_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_protocol_idx" ON "contracts" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "integration_keys_protocol_idx" ON "integration_keys" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "integration_keys_prefix_idx" ON "integration_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_members_uq" ON "protocol_members" USING btree ("protocol_id","user_id");--> statement-breakpoint
CREATE INDEX "protocol_members_user_idx" ON "protocol_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "protocols_slug_uq" ON "protocols" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "protocols_owner_idx" ON "protocols" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "treasury_protocol_idx" ON "treasury_addresses" USING btree ("protocol_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_wallet_uq" ON "users" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "incidents_protocol_idx" ON "incidents" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");