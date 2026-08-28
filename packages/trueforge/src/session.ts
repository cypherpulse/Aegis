import { genId, makeEvent, type AgentEvent } from "@aegis/shared";
import type {
  AgentSession,
  AgentSessionClient,
} from "truefoundry-gateway-sdk/agents";
import {
  createAgentSessionClient,
  readTrueForgeConfig,
  type TrueForgeConfig,
} from "./client.js";

export type SessionMode = "harness" | "local";

export interface SessionStartOptions {
  incidentId: string;
  emit: (event: AgentEvent) => void;
  /** Explicit config; when omitted it is read from the environment. */
  config?: TrueForgeConfig | null;
}

/**
 * A TrueForge session for one incident. When credentials are present it is a
 * real Agent Harness session (`AgentSessionClient.createSession`); otherwise it
 * degrades to a deterministic local session so the flow always runs (spec §21).
 */
export class TrueForgeSession {
  private constructor(
    readonly incidentId: string,
    readonly mode: SessionMode,
    readonly sessionId: string,
    private readonly emit: (event: AgentEvent) => void,
    private readonly client?: AgentSessionClient,
    private readonly session?: AgentSession,
  ) {}

  static async start(opts: SessionStartOptions): Promise<TrueForgeSession> {
    const cfg = opts.config ?? readTrueForgeConfig();

    if (cfg) {
      try {
        const client = await createAgentSessionClient(cfg);
        const session = await client.createSession({
          agentName: cfg.commanderAgent,
        });
        const sessionId =
          (session as { sessionId?: string; id?: string }).sessionId ??
          (session as { sessionId?: string; id?: string }).id ??
          genId("sess");
        opts.emit(
          makeEvent({
            incidentId: opts.incidentId,
            type: "session.created",
            actor: "trueforge",
            payload: { mode: "harness", sessionId, agent: cfg.commanderAgent },
          }),
        );
        return new TrueForgeSession(
          opts.incidentId,
          "harness",
          sessionId,
          opts.emit,
          client,
          session,
        );
      } catch (err) {
        // TrueForge unreachable/misconfigured — fall back, do not crash.
        opts.emit(
          makeEvent({
            incidentId: opts.incidentId,
            type: "session.created",
            actor: "trueforge",
            payload: {
              mode: "local",
              fallback: true,
              reason: err instanceof Error ? err.message : "unknown",
            },
          }),
        );
      }
    }

    const sessionId = genId("sess");
    opts.emit(
      makeEvent({
        incidentId: opts.incidentId,
        type: "session.created",
        actor: "trueforge",
        payload: { mode: "local", sessionId },
      }),
    );
    return new TrueForgeSession(
      opts.incidentId,
      "local",
      sessionId,
      opts.emit,
    );
  }

  /**
   * Run a real, bounded streaming turn for narration/observability. Best-effort:
   * aborts after a short budget and never throws. Returns any model text.
   * Server-side tool execution against the tenant's MCP servers is a platform
   * deployment concern; the deterministic tool reads happen in the runner.
   */
  async narrateTurn(prompt: string, timeoutMs = 45_000): Promise<string | undefined> {
    if (this.mode !== "harness" || !this.session) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // The gateway streams assistant text as `model.message.delta` events (the
    // bare `model.message` carries only metadata), and the final answer is on
    // `turn.done` → state.output.content. Accumulate the deltas; fall back to
    // the final output if we saw none.
    let streamed = "";
    let final = "";
    try {
      const prepared = this.session.prepareTurn({
        input: [{ type: "user.message", content: prompt }],
      });
      const stream = prepared.execute(
        { stream: true },
        { abortSignal: controller.signal },
      );
      for await (const { event } of stream) {
        const e = event as { type?: string; content?: unknown; state?: { output?: { content?: unknown } } };
        if (e.type === "model.message.delta") {
          if (typeof e.content === "string") streamed += e.content;
        } else if (e.type === "turn.done") {
          const out = e.state?.output?.content;
          if (typeof out === "string") final = out;
          break;
        }
      }
    } catch {
      // bounded + best-effort; callers fall back to their own summary
    } finally {
      clearTimeout(timer);
    }
    const text = (final || streamed).trim();
    return text || undefined;
  }
}
