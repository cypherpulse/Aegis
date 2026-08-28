// End-to-end check: run the autonomous assistant against the real aegis-commander.
// Run: pnpm --filter @aegis/api exec tsx assistant-check.ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb, ensureDevUser } from "@aegis/database";
import { TrueForgeSession } from "@aegis/trueforge";
import { buildApp } from "./src/app.js";
import { runAssistant } from "./src/assistant/agent.js";
import type { AssistantCtx } from "./src/assistant/tools.js";

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

const handle = createDb();
const { jobs } = await buildApp({ db: handle });
const user = await ensureDevUser(handle.db);

const ctx: AssistantCtx = {
  db: handle.db,
  jobs,
  authOn: false, // demo scope for the check (sees all incidents)
  userId: user.id,
  ownerProtocolIds: [],
};

const question = process.argv[2] ?? "Summarize my incidents and their severity, and name the most critical one.";
const session = await TrueForgeSession.start({ incidentId: "check", emit: () => {} });
console.log("session mode:", session.mode, "\nQ:", question, "\n");

const result = await runAssistant(session, question, ctx);
console.log("=== STEPS ===");
for (const s of result.steps) console.log(`• ${s.tool}(${JSON.stringify(s.args)})`);
console.log("\n=== REPLY (" + result.mode + ") ===\n" + result.reply);

await handle.close();
process.exit(0);
