// Diagnostic: create a session and run ONE turn against aegis-commander,
// printing every event type so we can see whether/how it responds (text,
// tool calls, etc.). Run: pnpm --filter @aegis/api exec tsx trueforge-turn.ts
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
  console.log("No TrueForge config.");
  process.exit(1);
}

const client = await createAgentSessionClient(cfg);
const session = await client.createSession({ agentName: cfg.commanderAgent });
const sessionId =
  (session as { sessionId?: string; id?: string }).sessionId ??
  (session as { sessionId?: string; id?: string }).id ??
  "?";
console.log("session:", sessionId, "\nrunning a turn…\n");

const prepared = (session as unknown as {
  prepareTurn: (x: unknown) => { execute: (a: unknown, b?: unknown) => AsyncIterable<{ event: Record<string, unknown> }> };
}).prepareTurn({
  input: [{ type: "user.message", content: "Reply with one short sentence: are you online and able to answer?" }],
});

const eventTypes: Record<string, number> = {};
let text = "";
try {
  const stream = prepared.execute({ stream: true });
  for await (const { event } of stream) {
    const t = String(event["type"]);
    eventTypes[t] = (eventTypes[t] ?? 0) + 1;
    if (t === "model.message") {
      const c = event["content"];
      text += typeof c === "string" ? c : JSON.stringify(c);
    }
    // Print the first occurrence of each event type in full for inspection.
    if (eventTypes[t] === 1) console.log(`[${t}]`, JSON.stringify(event).slice(0, 300));
    if (t === "turn.done") break;
  }
} catch (e) {
  console.error("\nTURN FAILED:", e instanceof Error ? e.message : e);
}
console.log("\nevent counts:", JSON.stringify(eventTypes));
console.log("model text  :", text || "(none)");
