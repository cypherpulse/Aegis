import type { AgentSessionClient } from "truefoundry-gateway-sdk/agents";
import type { TrueFoundryClient } from "truefoundry-sdk";

/** Resolved TrueForge credentials. Absent config means run in local mode. */
export interface TrueForgeConfig {
  apiUrl: string;
  apiKey: string;
  /** Name of the commander agent registered in the TrueForge tenant. */
  commanderAgent: string;
}

/**
 * Read TrueForge credentials from the environment. Returns null when either the
 * URL or key is missing — the system then runs the deterministic local runtime.
 */
export function readTrueForgeConfig(
  env: NodeJS.ProcessEnv = process.env,
): TrueForgeConfig | null {
  const apiUrl = env.TRUEFORGE_API_URL?.trim();
  const apiKey = env.TRUEFORGE_API_KEY?.trim();
  if (!apiUrl || !apiKey) return null;
  return {
    apiUrl,
    apiKey,
    commanderAgent: env.TRUEFORGE_COMMANDER_AGENT?.trim() || "aegis-commander",
  };
}

/**
 * Runtime SDK client (sessions + streaming turns) via the AI Gateway. The SDK
 * is imported lazily so the deterministic offline path never loads it.
 */
export async function createAgentSessionClient(
  cfg: TrueForgeConfig,
): Promise<AgentSessionClient> {
  const { AgentSessionClient } = await import("truefoundry-gateway-sdk/agents");
  return new AgentSessionClient({
    baseUrl: cfg.apiUrl,
    apiKey: cfg.apiKey,
  });
}

/** Control-plane SDK client (agent/skill definitions, traces). Lazy-loaded. */
export async function createControlClient(
  cfg: TrueForgeConfig,
): Promise<TrueFoundryClient> {
  const { TrueFoundryClient } = await import("truefoundry-sdk");
  return new TrueFoundryClient({
    environment: cfg.apiUrl,
    apiKey: cfg.apiKey,
  });
}
