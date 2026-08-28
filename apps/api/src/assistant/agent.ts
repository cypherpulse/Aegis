import type { TrueForgeSession } from "@aegis/trueforge";
import { assistantTools, toolByName, type AssistantCtx } from "./tools.js";

export interface AssistantStep {
  tool: string;
  args: unknown;
  observation: unknown;
}

export interface AssistantResult {
  reply: string;
  mode: "harness" | "local";
  steps: AssistantStep[];
}

const MAX_STEPS = 6;

function toolCatalog(): string {
  return assistantTools
    .map((t) => `- ${t.name}: ${t.description}\n  args: ${t.parametersHint}`)
    .join("\n");
}

/** Extract the first JSON object from model text (handles ``` fences / prose). */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

function systemPrompt(scratchpad: string, message: string): string {
  return [
    "You are Aegis Assistant, an autonomous blockchain incident-response agent.",
    "",
    "IMPORTANT: You have NO built-in/native tools. The ONLY way to look anything up",
    "or take an action is to reply with a SINGLE JSON object using the protocol below.",
    "The system executes it and replies with the result, then you continue. Never say a",
    "tool is 'unavailable' or 'not accessible' — instead emit the JSON to call it.",
    "",
    "AVAILABLE TOOLS (call via JSON):",
    toolCatalog(),
    "",
    "Your reply must be EXACTLY one JSON object and nothing else — one of:",
    '  {"tool": "<name>", "args": { ... }}      // run a tool',
    '  {"final": "<the answer for the user>"}   // finish and answer',
    "",
    "Example — to list incidents you output exactly:",
    '  {"tool": "list_incidents", "args": {}}',
    "",
    "Rules: output ONLY the JSON (no prose, no code fences). Rely solely on tool",
    "results — never invent data. Cite incident IDs and concrete on-chain facts.",
    "",
    scratchpad
      ? `TOOL RESULTS SO FAR:\n${scratchpad}\n\nContinue: call another tool or give {"final": ...}.`
      : "",
    `USER QUESTION: ${message}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Run the assistant as an autonomous tool-using agent. When a TrueForge harness
 * session is available it drives the loop (the model chooses tools); otherwise
 * it falls back to a deterministic single-tool answer over the real data.
 */
export async function runAssistant(
  session: TrueForgeSession,
  message: string,
  ctx: AssistantCtx,
): Promise<AssistantResult> {
  const steps: AssistantStep[] = [];

  // Deterministic fallback when the LLM harness is unavailable.
  if (session.mode !== "harness") {
    return { ...(await deterministic(message, ctx, steps)), mode: "local" };
  }

  let scratchpad = "";
  for (let i = 0; i < MAX_STEPS; i++) {
    const text = await session.narrateTurn(systemPrompt(scratchpad, message));
    if (!text) break; // harness stopped responding → fall back below
    const parsed = extractJson(text);
    if (!parsed) return { reply: text.trim(), mode: "harness", steps };
    if (typeof parsed["final"] === "string") {
      return { reply: parsed["final"] as string, mode: "harness", steps };
    }
    const name = parsed["tool"] as string | undefined;
    const tool = name ? toolByName.get(name) : undefined;
    if (!tool) return { reply: text.trim(), mode: "harness", steps };
    let observation: unknown;
    try {
      const args = tool.parameters.parse(parsed["args"] ?? {});
      observation = await tool.handler(args, ctx);
    } catch (e) {
      observation = { error: e instanceof Error ? e.message : String(e) };
    }
    steps.push({ tool: tool.name, args: parsed["args"] ?? {}, observation });
    scratchpad += `\n${tool.name}(${JSON.stringify(parsed["args"] ?? {})}) => ${JSON.stringify(observation).slice(0, 1200)}`;
  }

  // Ran out of steps (or harness went quiet): summarize what we gathered.
  const fallback = await deterministic(message, ctx, steps);
  return { ...fallback, mode: "harness" };
}

/** No-LLM path: pick the obvious tool from the message and answer from data. */
async function deterministic(
  message: string,
  ctx: AssistantCtx,
  steps: AssistantStep[],
): Promise<{ reply: string; steps: AssistantStep[] }> {
  const idMatch = message.match(/INC_[a-f0-9]+/i);
  const addrMatch = message.match(/0x[a-fA-F0-9]{40}/);
  let tool = toolByName.get("list_incidents")!;
  let args: Record<string, unknown> = {};
  if (idMatch) {
    tool = toolByName.get("get_incident")!;
    args = { incidentId: idMatch[0] };
  } else if (addrMatch) {
    tool = toolByName.get("get_contract_activity")!;
    const chain = /base/i.test(message) ? "Base" : /eth/i.test(message) ? "Ethereum" : "Base";
    args = { chain, address: addrMatch[0] };
  }
  const observation = await tool.handler(tool.parameters.parse(args), ctx);
  steps.push({ tool: tool.name, args, observation });
  return {
    reply:
      `Here is the live data for "${message}":\n\n` +
      "```json\n" +
      JSON.stringify(observation, null, 2).slice(0, 2000) +
      "\n```\n(Answered directly from your Aegis data.)",
    steps,
  };
}
