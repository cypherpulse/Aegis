import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "@aegis/database";
import { buildApp } from "./app.js";
import { MonitorService } from "./monitor.js";

// Load env from the repo-root .env (and a local .env) if present, so
// AUTH_REQUIRED / DATABASE_URL / GOOGLE_* configured there take effect.
for (const url of ["../../../.env", "../.env"]) {
  const path = fileURLToPath(new URL(url, import.meta.url));
  if (existsSync(path)) {
    try {
      (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(path);
    } catch {
      /* older Node without loadEnvFile — ignore */
    }
  }
}

async function main(): Promise<void> {
  const dbHandle = createDb();
  const corsEnv = process.env.CORS_ORIGINS?.trim();
  // Credentials are enabled, so never reflect arbitrary origins in production —
  // that would let any site make credentialed requests. Require an explicit
  // allowlist there; only dev reflects any origin for convenience.
  let corsOrigins: string[] | boolean;
  if (corsEnv) {
    corsOrigins = corsEnv.split(",").map((s) => s.trim());
  } else if (process.env.NODE_ENV === "production") {
    corsOrigins = false;
    console.warn(
      "[api] CORS_ORIGINS is not set in production — cross-origin browser requests are blocked. " +
        "Set CORS_ORIGINS to your web app origin(s).",
    );
  } else {
    corsOrigins = true;
  }
  const { app, jobs } = await buildApp({
    db: dbHandle,
    logger: true,
    corsOrigins,
  });

  // Background monitor (opt-in): watches registered contracts/treasury on their
  // mainnet chains and auto-launches investigations on large movements.
  let monitor: MonitorService | undefined;
  if (process.env.MONITOR_ENABLED === "true") {
    const intervalMs = Number(process.env.MONITOR_INTERVAL_MS ?? 30_000);
    const thresholdEnv = process.env.MONITOR_DEFAULT_THRESHOLD_WEI;
    monitor = new MonitorService(dbHandle.db, jobs, {
      intervalMs,
      ...(thresholdEnv && /^\d+$/.test(thresholdEnv)
        ? { defaultThresholdWei: BigInt(thresholdEnv) }
        : {}),
      onError: (err) => app.log.error({ err }, "monitor tick failed"),
    });
    monitor.start();
    app.log.info(`Monitor enabled (interval ${intervalMs}ms)`);
  }

  // Render/Heroku inject PORT and route to it; fall back to API_PORT then 4000.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`Aegis API listening on :${port}`);

  const shutdown = async (): Promise<void> => {
    monitor?.stop();
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
