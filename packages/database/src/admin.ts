import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client.js";

/** Apply all pending migrations to a database. */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
}

/** Truncate every table (tests only). */
export async function truncateAll(db: Database): Promise<void> {
  await db.execute(
    sql`truncate table agent_events, root_causes, evidence, findings, investigator_runs, investigations, incidents, integration_keys, contracts, treasury_addresses, monitoring_configs, protocol_members, protocols, sessions, wallet_nonces, users restart identity cascade`,
  );
}
