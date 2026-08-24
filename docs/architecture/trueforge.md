# TrueForge Integration

TrueForge is TrueFoundry's **Agent Harness** — a managed runtime on top of the
AI Gateway and MCP Gateway. Aegis uses the two published TypeScript SDKs.

## SDKs used (verified, not invented)

### Runtime — `truefoundry-gateway-sdk`

`import { AgentSessionClient } from "truefoundry-gateway-sdk/agents"`

- `new AgentSessionClient({ baseUrl, apiKey })`
- `client.createSession({ agentName }) → AgentSession`  — one session per incident
- `session.prepareTurn({ input: [{ type: "user.message", content }] }) → PreparedTurn`
- `prepared.execute({ stream: true }) → AsyncIterable<TurnStreamData>`
- Streaming event union (`event.type`): `turn.created`, `model.message`,
  `tool.response`, `tool.approval_required`, `mcp.initialize`, `sandbox.created`,
  `turn.done`, …

These are mapped in `packages/trueforge/src/session.ts` and consumed by
`HarnessAgentRunner` in `runner.ts`.

### Control plane — `truefoundry-sdk`

`new TrueFoundryClient({ environment, apiKey })` — agent/skill definitions and
traces. Lazy-loaded; used when credentials are present.

## How it participates

```
Incident → TrueForgeSession.start()
             creds present → AgentSessionClient.createSession()   (REAL)
             creds absent  → deterministic local session
          → per investigator: a bounded real streaming turn (narration/observability)
                              + read-only MCP tool execution (the investigation)
```

The session runner and the tool runner share one approval controller and one
event stream, so `harness` and `local` modes behave identically to the rest of
the system.

## Credentials

`TRUEFORGE_API_URL`, `TRUEFORGE_API_KEY`, `TRUEFORGE_COMMANDER_AGENT`. Absent →
local mode (the demo default). A credential-gated smoke test
(`packages/trueforge/tests`) exercises the real `createSession`; it is skipped
when credentials are absent — a mocked run is never presented as a real
integration (spec §23).

## Known limitation

Executing tools **server-side** inside the managed harness (against the tenant's
MCP Gateway) requires deploying the MCP server and agent definitions to the
TrueFoundry tenant — a deployment step, not a code change. In Phase 1 the real
session/turn runs, and tool execution happens through the same read-only MCP
tools in-process.
