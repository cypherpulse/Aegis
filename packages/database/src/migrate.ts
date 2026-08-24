import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

/** Apply all pending Drizzle migrations, then exit. */
async function main(): Promise<void> {
  const handle = createDb();
  const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
  await migrate(handle.db, { migrationsFolder });
  await handle.close();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
