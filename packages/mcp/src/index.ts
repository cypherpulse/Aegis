import { ToolRegistry } from "./tool.js";
import { allTools } from "./tools.js";

export * from "./schemas.js";
export * from "./tool.js";
export {
  allTools,
  applicationTools,
  blockchainTools,
  treasuryTools,
} from "./tools.js";
export { codeTools } from "./code-tools.js";
export { createMcpServer, startStdioMcpServer } from "./server.js";

/** A registry pre-loaded with every read-only Aegis tool. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll(allTools);
  return registry;
}
