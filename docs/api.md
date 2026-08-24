# Aegis Backend API

Base URL: `http://localhost:4000` · API prefix: `/api/v1` · OpenAPI: `GET /api/openapi.json`

All responses use one envelope:

```json
{ "data": <payload> | null, "error": { "code": "STRING", "message": "STRING", "fields?": { "path": "msg" } } | null }
```

Errors never include stack traces. Validation errors return `400` with
`error.code = "VALIDATION"` and per-field messages in `error.fields`.

## Lifecycle & status values

- **Incident status**: `DETECTED → INVESTIGATING → INVESTIGATION_COMPLETE | FAILED`.
- **Investigation status**: `QUEUED → RUNNING → COMPLETE | PARTIAL | FAILED`.
- **Investigation stage** (pipeline position): `CREATED → COMMANDER → FUSION → CODE → ROOT_CAUSE → DONE`.
- **Investigator finding status**: `SUCCESS | FAILED`.
- **Root cause status**: `COMPLETE | PARTIAL | INSUFFICIENT_EVIDENCE | FAILED`.
- **Approval state**: `NOT_REQUIRED | REQUIRED | APPROVED | REJECTED | EXPIRED`.

Investigation runs **asynchronously**: creating an incident returns immediately
with `status: "QUEUED"` and the work proceeds in the background. Follow progress
via the events stream.

## Endpoints

### `POST /api/v1/incidents`
Create an incident and queue its investigation. Body (all optional — an empty
body creates the deterministic hero incident):

```json
{ "type": "TREASURY_GAS_DEPLETION", "severity": "CRITICAL", "title": "…",
  "description": "…", "affectedProtocol": "…",
  "chain": { "name": "Base Sepolia", "chainId": 84532 }, "metadata": {} }
```

`202` → `{ "data": { "incidentId": "INC_…", "investigationId": "inv_…", "status": "QUEUED" } }`

### `GET /api/v1/incidents`
Query: `status`, `severity`, `chain`, `limit` (≤100, default 20), `offset`.
`200` → `{ "data": { "items": Incident[], "total": number, "limit": number, "offset": number } }`

### `GET /api/v1/incidents/:id`
`200` → `{ "data": { "incident": Incident, "investigation": Investigation | null,
"stage": Stage | null, "findings": Finding[], "rootCause": RootCause | null } }`
`404` if unknown.

### `POST /api/v1/incidents/:id/investigate`
Idempotent. If an investigation is already active for the incident, returns it
(`200`); otherwise creates + queues one (`202`).
→ `{ "data": { "investigationId": "inv_…", "status": "QUEUED" | "RUNNING" } }`

### `GET /api/v1/incidents/:id/events`
Query: `afterSeq` (cursor), `limit` (≤500, default 100).
`200` → `{ "data": { "items": StoredEvent[], "nextCursor": string | null } }`
Each `StoredEvent` has a monotonic `seq` used for cursoring and SSE resume.

### `GET /api/v1/incidents/:id/events/stream` (SSE)
`text/event-stream`. Replays history the client has not seen, then streams live
events for this incident only. Reconnect with the `Last-Event-ID` header (or
`?afterSeq=`) to resume. See [frontend-integration.md](frontend-integration.md).

### `GET /api/v1/investigations/:id`
`200` → `{ "data": { "investigation": Investigation, "findings": Finding[], "rootCause": RootCause | null } }`

### `GET /api/v1/investigations/:id/findings`
`200` → `{ "data": { "findings": Finding[] } }`

### `GET /api/v1/investigations/:id/root-cause`
`200` → `{ "data": { "rootCause": RootCause } }` · `404` until available.

### Health
- `GET /health` → `{ "data": { "status": "ok" } }`
- `GET /ready` → `200`/`503` `{ "data": { "status": "ready"|"degraded", "db": boolean } }`

## Object shapes (see zod schemas in `packages/shared`)

- **Incident**: `id, type, severity, title, description, affectedProtocol, chain{name,chainId}, detectedAt, status, metadata`.
- **Finding** (`InvestigationFinding`): `investigator (BLOCKCHAIN|TREASURY|APPLICATION|CODE), status, summary, evidence[], confidence (0–1), severity, timestamp, metadata`.
- **Evidence**: `source, type, reference, observation, timestamp`.
- **RootCause**: `incidentId, title, explanation, confidence (0–1), severity, evidence[], contributingFactors[{description,weight}], status, generatedAt`.
- **AgentEvent** / **StoredEvent**: `id, incidentId, timestamp, type, actor, payload` (+ `seq` on stored).

## Agent event types

`incident.created`, `investigation.started`, `commander.started`, `session.created`,
`investigator.{started,tool_called,tool_completed,completed,failed}`,
`approval.{requested,granted,denied,timeout}`,
`evidence.{fusion_started,fusion_completed}`,
`code_investigator.{started,tool_called,tool_completed,completed,failed}`,
`sandbox.{started,completed,failed,timeout}`,
`root_cause.{started,completed}`, `investigation.{completed,failed}`.
