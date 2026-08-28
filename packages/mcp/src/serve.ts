#!/usr/bin/env -S npx tsx
import { fileURLToPath } from "node:url";
import { createBlockchainProvider } from "@aegis/blockchain";
import { startStdioMcpServer } from "./server.js";
import type { ToolContext } from "./tool.js";

/**
 * Runnable entrypoint for the Aegis MCP server (stdio transport). Exposes the
 * read-only Aegis tools to any MCP client (Claude Code, TrueForge MCP Gateway,
 * etc.). Uses real Base Sepolia reads when BASE_SEPOLIA_RPC_URL is set, else the
 * deterministic simulator. Run with: `pnpm --filter @aegis/mcp start`.
 */
const ctx: ToolContext = {
  provider: createBlockchainProvider({}),
  codeRoot:
    process.env.CODE_FIXTURE_ROOT ??
    fileURLToPath(new URL("../../../fixtures/demo-app", import.meta.url)),
};

startStdioMcpServer(ctx).catch((err) => {
  console.error("Aegis MCP server failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
