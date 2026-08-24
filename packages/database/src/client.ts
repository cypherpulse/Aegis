import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

const DEFAULT_URL = "postgresql://aegis:aegis@localhost:5544/aegis";

/** Create a pooled Drizzle client. Reads DATABASE_URL (falls back to the
 * docker-compose default). Never logs the URL/credentials. */
export function createDb(databaseUrl?: string): DbHandle {
  const connectionString =
    databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_URL;
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

/** Lightweight readiness probe for /ready. */
export async function pingDb(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
