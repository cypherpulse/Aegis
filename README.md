# Aegis

**AI-powered incident investigation for blockchain protocols.**

Aegis takes an onchain incident, spins up a real agent-harness session, delegates
to specialist investigators that reach read-only tools over MCP, correlates their
structured findings, inspects the application code, validates hypotheses in an
isolated sandbox, and returns a unified **root cause** — all persisted and exposed
through a clean REST + streaming API.

It is designed around one principle: give the agent a *license to act* — it can
**reach tools**, **run code safely**, and **be stopped** at a human approval gate.

---

## How it works

```
INCIDENT
   │
   ▼
AGENT-HARNESS SESSION            (TrueForge — real when credentialed, local otherwise)
   │
   ▼
INCIDENT COMMANDER
   │
   ├── BLOCKCHAIN  INVESTIGATOR ┐
   ├── TREASURY    INVESTIGATOR │  run in parallel, failures isolated
   └── APPLICATION INVESTIGATOR ┘  (read-only MCP tools; a sensitive tool
   │                                passes a human-in-the-loop approval gate)
   ▼
EVIDENCE FUSION                  (deterministic correlation → hypothesis)
   │
   ▼
CODE INVESTIGATOR                (reads a jailed code fixture via read-only tools)
   │
   ▼
SANDBOX                          (runs the analysis in a hardened container / isolate)
   │
   ▼
ROOT CAUSE                       (deterministic aggregation → title + confidence)
```

Every stage emits a structured event; every result is persisted and streamable.

### The reference scenario

A deterministic **treasury gas depletion** incident on Base Sepolia: the
treasury's native balance falls below the gas reserve, payout transactions revert
for insufficient gas, and the payout worker retries in a loop. A built-in
simulator makes it reproducible on every run, and a code fixture carries the
matching bug for the Code Investigator to discover.

---

## Quick start

Requirements: **Node ≥ 18** (tested on 22) and **pnpm 10**.

```bash
pnpm install
pnpm demo
```

`pnpm demo` runs the entire pipeline end-to-end — session → commander → three
investigators → fusion → code investigator → sandbox → root cause — streaming the
event timeline and printing every finding plus the final root cause. It is fully
deterministic and needs **no credentials, database, or network**.

### Running the backend API

```bash
docker compose up -d postgres        # Postgres on localhost:5544
pnpm db:migrate                      # apply database migrations
pnpm build:sandbox                   # optional: build the hardened sandbox image
pnpm --filter @aegis/api dev         # API on http://localhost:4000
```

```bash
# create an incident (empty body = the reference scenario) and follow it live
curl -X POST http://localhost:4000/api/v1/incidents -H 'content-type: application/json' -d '{}'
curl -N  http://localhost:4000/api/v1/incidents/<id>/events/stream    # live SSE
curl     http://localhost:4000/api/v1/incidents/<id>                  # full state + root cause
```

API reference: [`docs/api.md`](docs/api.md) · integration guide:
[`docs/frontend-integration.md`](docs/frontend-integration.md) · machine-readable
spec: `GET /api/openapi.json`.

---

## Project structure

A pnpm + TypeScript (strict) monorepo.

| Package | Responsibility |
|---|---|
| `packages/shared` | Domain types + Zod schemas: incident, finding, evidence, root cause, events, errors. |
| `simulator` | Deterministic incident fixture and telemetry read functions. |
| `packages/blockchain` | `BlockchainProvider` abstraction → simulator or real Base Sepolia (viem). |
| `packages/mcp` | Read-only tools (schemas, validation, error handling) + a real MCP server. |
| `packages/trueforge` | Agent-harness session, agent runners, and the approval controller. |
| `packages/agents` | Incident Commander + Blockchain / Treasury / Application / Code investigators. |
| `packages/incident-engine` | Evidence Fusion + Root Cause + the `runInvestigation` orchestrator. |
| `packages/sandbox` | Sandbox drivers: hardened Docker container + subprocess isolate. |
| `packages/database` | PostgreSQL + Drizzle schema, migrations, repositories, persistence store. |
| `apps/api` | Fastify REST API + SSE + OpenAPI, event publisher, background job runner. |
| `fixtures/demo-app` | Code fixture carrying the bug the Code Investigator discovers. |

---

## What's real vs. simulated

| Component | Behavior |
|---|---|
| **Agent-harness session** | Real TrueForge session (`AgentSessionClient.createSession` + a bounded streaming turn) when credentials are set; a deterministic local session otherwise. Never crashes if TrueForge is unreachable. |
| **MCP tools** | Real tool layer with Zod input/output schemas, exposed via a real MCP server *and* an in-process registry (one source of truth). All read-only. |
| **Blockchain data** | Deterministic simulator by default; real Base Sepolia reads via viem when `BASE_SEPOLIA_RPC_URL` is set. |
| **Investigators, fusion, findings, root cause** | Real logic — every finding and confidence value is computed from the tools' output, never hardcoded. |
| **Approval gate** | Real. A sensitive tool emits `approval.requested` → `approval.granted` (auto in the demo; supports a manual/timeout policy). |
| **Persistence & API** | Real PostgreSQL (Drizzle) + Fastify REST/SSE with OpenAPI; investigations run asynchronously and events stream per-incident. |
| **Sandbox** | Real execution of the analysis program — hardened Docker container when available, locked-down subprocess isolate otherwise. |

---

## Agent-harness integration

- **Runtime** — `truefoundry-gateway-sdk`: `AgentSessionClient` → `createSession`
  → `prepareTurn` → streaming `execute`. Harness turn events map onto Aegis's
  structured agent events.
- **Control plane** — `truefoundry-sdk` for agent/skill definitions and traces
  (lazy-loaded; used when credentials are present).
- Every SDK call is verified against the installed package's types.

---

## Security

Aegis is **read-only and isolated**. There is no signing, transaction execution,
fund transfer, or destructive operation.

- Investigation tools are schema-validated, read-only, and **path-jailed** — the
  code tools cannot escape the fixture directory.
- The **sandbox** treats generated code as untrusted and never runs it via
  `eval`/`Function`/`exec` on the host. It uses a hardened Docker container
  (`--network none`, non-root, read-only rootfs, memory/CPU/pid limits, no project
  mount, no secrets) when available, or a locked-down subprocess isolate (cleaned
  environment, temp workspace, hard timeout with kill) otherwise.
- The API validates all input, sets security headers, configures CORS explicitly,
  limits body size, and never leaks stack traces.

Any future remediation stops at an explicit human-approval boundary — no
autonomous fund movement.

---

## Configuration

Copy [`.env.example`](.env.example) to `.env`. Everything is optional for
`pnpm demo`; the API needs `DATABASE_URL`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection for the API (default `…@localhost:5544/aegis`). |
| `API_PORT`, `CORS_ORIGINS` | API port and allowed CORS origins. |
| `BASE_SEPOLIA_RPC_URL` | Enables real Base Sepolia reads (read-only, no keys). |
| `TRUEFORGE_API_URL`, `TRUEFORGE_API_KEY` | Enable the real TrueForge harness session. |
| `SANDBOX_DRIVER` | Force `docker` or `subprocess` (default: auto). |
| `CODE_FIXTURE_ROOT` | Override the code fixture path. |

---

## Development

```bash
pnpm typecheck   # tsc across all packages
pnpm lint        # eslint (flat config, typescript-eslint)
pnpm test        # vitest, per package
pnpm test:e2e    # end-to-end pipeline
pnpm build       # compile check across all packages
```

---

## MCP server

The read-only Aegis tools are exposed as a real MCP server (stdio) so any MCP
client — Claude Code, a TrueForge MCP Gateway connection, etc. — can call them.
It shares the exact tool handlers used in-process, so there is one source of
truth.

```bash
pnpm mcp                       # start the stdio MCP server (aegis-tools)
# or register the bin directly: aegis-mcp
```

Real Base Sepolia reads are used when `BASE_SEPOLIA_RPC_URL` is set; otherwise
the deterministic simulator.

---

## Deployment

Postgres + the API run via Docker Compose:

```bash
# Postgres only (local dev):
docker compose up -d postgres && pnpm db:migrate

# Full stack (API image runs migrations on start, monitor optional):
SESSION_SECRET=... AUTH_REQUIRED=true docker compose --profile app up --build
```

The API image ([Dockerfile](Dockerfile)) installs the workspace and runs
`db:migrate` then the API. Configure via environment (`DATABASE_URL`,
`SESSION_SECRET`, `AUTH_REQUIRED`, `MONITOR_ENABLED`, `TRUEFORGE_*`, `CHAIN_RPC_*`);
never commit secrets. The sandbox auto-falls back to the subprocess driver inside
the container.

---

## Qodo Code Review Evidence

Meaningful changes are reviewed by [Qodo](https://www.qodo.ai/) via pull request
before merge (direct pushes to `main` are not treated as reviewed work).

- **Reviewed & merged PR:** [#1 — feat: finalize MCP, deploy, multichain, isolation, agentic assistant](https://github.com/cypherpulse/Aegis/pull/1)
- **What Qodo found → what changed:** Qodo's automated review flagged four bugs, all
  fixed in the follow-up commit: (1) the Docker build omitted the root-level
  `simulator` workspace so `pnpm install --frozen-lockfile` would fail — now the
  full workspace is copied before install; (2) the `aegis-mcp` bin pointed at a
  `.ts` file with no launcher — added a `tsx` shebang; (3) the Compose `api`
  service dropped documented runtime env (`CHAIN_RPC_*`, monitor tuning,
  `GOOGLE_*`, sandbox) — now forwarded; and (4) a **security** issue where
  credentialed CORS defaulted to reflecting any origin — production now requires
  an explicit `CORS_ORIGINS` allowlist.

The PR thread shows the automated Qodo review and the follow-up `/agentic_review`
after the fixes were pushed.

---

## License

MIT — see [LICENSE](LICENSE).
