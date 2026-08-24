import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { callTool, type ToolContext } from "./tool.js";
import { allTools } from "./tools.js";

/**
 * Build a real MCP server exposing the read-only Aegis tools. This is the same
 * server surface a TrueForge MCP Gateway connection would consume; the tool
 * handlers are shared with the in-process registry, so there is a single source
 * of truth (spec §11 — no fake MCP).
 */
export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "aegis-tools", version: "0.1.0" });

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
        annotations: { title: tool.name, readOnlyHint: true },
      },
      async (args: unknown) => {
        const { output } = await callTool(tool, args, ctx);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
        };
      },
    );
  }

  return server;
}

/** Serve the tools over stdio for a real MCP client. */
export async function startStdioMcpServer(ctx: ToolContext): Promise<void> {
  const server = createMcpServer(ctx);
  await server.connect(new StdioServerTransport());
}
