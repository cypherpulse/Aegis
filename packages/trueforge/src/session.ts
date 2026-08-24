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
  async narrateTurn(prompt: string): Promise<string | undefined> {
    if (this.mode !== "harness" || !this.session) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const chunks: string[] = [];
    try {
      const prepared = this.session.prepareTurn({
        input: [{ type: "user.message", content: prompt }],
      });
      const stream = prepared.execute(
        { stream: true },
        { abortSignal: controller.signal },
      );
      for await (const { event } of stream) {
        if (event.type === "model.message") {
          const text =
            typeof event.content === "string"
              ? event.content
              : event.content != null
                ? JSON.stringify(event.content)
                : "";
          if (text) chunks.push(text);
        } else if (event.type === "turn.done") {
          break;
        }
      }
    } catch {
      // bounded + best-effort; the investigation proceeds via the tool runner
    } finally {
      clearTimeout(timer);
    }
    return chunks.length ? chunks.join("\n") : undefined;
  }
}
