// Diagnostic: probe candidate TrueForge agent-gateway base URLs and report
// which one resolves the /v1/agents/sessions endpoint (non-404).
// Run:  pnpm --filter @aegis/api exec tsx trueforge-check.ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readTrueForgeConfig, createAgentSessionClient } from "@aegis/trueforge";

for (const rel of ["../../.env"]) {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  if (existsSync(p)) {
    try {
      (process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile(p);
    } catch {
      /* ignore */
    }
  }
}

const cfg = readTrueForgeConfig();
if (!cfg) {
  console.log("No TrueForge config (TRUEFORGE_API_URL / TRUEFORGE_API_KEY not set).");
  process.exit(1);
}

const configured = cfg.apiUrl.replace(/\/+$/, "");
const root = configured.replace(/\/(api|api\/.*)?$/, "");
const candidates = [
  ...new Set([
    configured,
    `${root}/api`,
    `${root}/api/agent`,
    `${root}/api/agents`,
    `${root}/api/svc/v1/agent`,
    `${root}/agent`,
    root,
  ]),
];

console.log("agent  :", cfg.commanderAgent);
console.log("key    :", cfg.apiKey.slice(0, 8) + "…(" + cfg.apiKey.length + " chars)");
console.log("Probing", candidates.length, "candidate base URLs → POST <base>/v1/agents/sessions\n");

for (const base of candidates) {
  try {
    const client = await createAgentSessionClient({ ...cfg, apiUrl: base });
    const session = await client.createSession({ agentName: cfg.commanderAgent });
    console.log(`✅ ${base}  → SESSION CREATED`);
    console.log("   ", JSON.stringify(session).slice(0, 200));
    console.log("\n>>> Set TRUEFORGE_API_URL to:", base);
    process.exit(0);
  } catch (e) {
    const anyE = e as Record<string, unknown>;
    const status = (anyE?.["statusCode"] ?? anyE?.["status"] ?? "?") as string;
    const name = (anyE?.["name"] as string) ?? "";
    // 404 = wrong path; 401/403 = RIGHT path, auth issue; 400/422 = right path.
    const verdict =
      status === 404 ? "wrong path" : status === 401 || status === 403 ? "PATH OK — auth issue" : "path likely OK";
    console.log(`✗ ${base}  → ${status} ${name} (${verdict})`);
  }
}
console.log(
  "\nNo candidate returned a session. Copy the exact base URL from the TrueFoundry console " +
    "(aegis-commander agent → API / code snippet) into TRUEFORGE_API_URL.",
);
