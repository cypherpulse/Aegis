import { createDb } from "@aegis/database";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const dbHandle = createDb();
  const corsEnv = process.env.CORS_ORIGINS?.trim();
  const { app } = await buildApp({
    db: dbHandle,
    logger: true,
    corsOrigins: corsEnv ? corsEnv.split(",").map((s) => s.trim()) : true,
  });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`Aegis API listening on :${port}`);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await dbHandle.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start API:", err instanceof Error ? err.message : err);
  process.exit(1);
});
