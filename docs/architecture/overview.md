# Architecture Overview (Phase 1)

Aegis turns an incident into a unified root-cause hypothesis through a real
TrueForge Agent Harness session.

## Flow

```
Incident (TREASURY_GAS_DEPLETION, Base Sepolia)
  → runInvestigation()                         [packages/incident-engine]
      → TrueForgeSession.start()               [packages/trueforge]
      → runCommander()                         [packages/agents]
          ├─ Blockchain Investigator ┐
          ├─ Treasury Investigator   │ Promise.allSettled (parallel, isolated)
          └─ Application Investigator ┘
              each: AgentRunner.run(plan)
                  → approval gate (sensitive tools)
                  → MCP tools (read-only)       [packages/mcp]
                  → structured InvestigationFinding
      → fuseEvidence(findings)                  [packages/incident-engine]
      → UnifiedEvidence (hypothesis + confidence + correlated signals)
```

## Key design points

- **One runner interface, two implementations.** `HarnessAgentRunner` (real
  TrueForge turn + MCP tools) and `LocalAgentRunner` (deterministic, offline).
  Selected by whether TrueForge credentials are present. Both feed the same
  event stream, findings, and fusion — so the demo is reproducible while the
  managed harness stays central and real when credentialed.
- **Failure isolation.** The commander uses `Promise.allSettled`; one
  investigator failing yields a `FAILED` finding and a `PARTIAL` fused result,
  never a crash (spec §12, §21).
- **Everything is an event.** Each stage emits a structured `AgentEvent`
  (`incident.created` … `investigation.completed`, plus `approval.*`), which is
  what a live UI (Phase 2) and the audit trail consume.
- **Determinism.** The simulator provides fixed data; findings and confidence
  are computed from that data, not hardcoded.

## Status lifecycle

`DETECTED → INVESTIGATING → (FUSION) → INVESTIGATION_COMPLETE | FAILED`.

## Package map

See the table in the [README](../../README.md#architecture).
