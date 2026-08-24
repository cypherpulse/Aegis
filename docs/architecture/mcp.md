# MCP & Tools

Tools are first-class, read-only components (`packages/mcp`). Each has a name,
description, Zod input schema, Zod output schema, a read-only classification, an
optional `sensitive` flag, and error handling.

## The ten Phase 1 tools

| Investigator | Tools |
|---|---|
| Blockchain | `getWalletBalance`, `getRecentTransactions`, `getTransaction`, `getTransactionReceipt` |
| Treasury | `getTreasuryBalance` *(sensitive)*, `getRecentTreasuryTransactions`, `getPayoutFailures` |
| Application | `getActiveAlerts`, `getServiceMetrics`, `getRecentLogs` |

## Execution contract

`callTool(tool, rawInput, ctx)`:

1. Validate `rawInput` against `inputSchema` → `ValidationError` on failure.
   Arbitrary input never reaches a handler unvalidated.
2. Run the handler (blockchain tools go through the `BlockchainProvider`;
   treasury/application tools read the simulator).
3. Validate the handler output against `outputSchema` → `ToolError` on
   malformed output.

## One source of truth, real MCP

The same tool handlers are exposed two ways:

- **`createMcpServer(ctx)`** — a real `@modelcontextprotocol/sdk` server
  (`registerTool` with the Zod input shape and a `readOnlyHint` annotation),
  connectable over stdio for a real MCP client / the TrueForge MCP Gateway.
- **`createToolRegistry()`** — an in-process registry used by the agent runners.

There is no fake MCP layer; both paths call the identical handlers.

## Approval gate

`getTreasuryBalance` is flagged `sensitive`. Before it runs, the
`ApprovalController` emits `approval.requested`; in `auto` mode it immediately
emits `approval.granted`, and in `manual` mode it waits on a resolver up to a
timeout (`approval.granted` / `approval.denied` / `approval.timeout`). A denied
or timed-out approval blocks that single tool and the investigation continues
with partial data — it never crashes. This is the "can be stopped" capability.

## Security

Read-only only: no signing, broadcasting, key access, shell, or destructive
filesystem operations (spec §10, §22).
