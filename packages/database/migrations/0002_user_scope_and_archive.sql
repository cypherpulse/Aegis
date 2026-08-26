ALTER TABLE "incidents" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
CREATE INDEX "incidents_created_by_idx" ON "incidents" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "protocols" ADD COLUMN "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "protocols" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "protocols_status_idx" ON "protocols" USING btree ("status");
