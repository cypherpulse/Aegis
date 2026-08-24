# Frontend Integration Guide

The backend is the single source of truth. The frontend consumes **only** the
REST API and the SSE stream — it must not import backend packages, touch the
database, or call TrueForge/MCP directly.

- Base URL: `http://localhost:4000` (configurable). API prefix: `/api/v1`.
- Contract: [api.md](api.md) · machine-readable: `GET /api/openapi.json`.
- No authentication is implemented in this phase (see [api.md](api.md)). CORS is
  configured via `CORS_ORIGINS`.

## Recommended flow (Incident Command Center)

1. **Create** an incident: `POST /api/v1/incidents` (empty body = hero incident).
   Keep `incidentId` + `investigationId` from the `202` response.
2. **Subscribe** to live progress:
   `GET /api/v1/incidents/:id/events/stream` (SSE).
3. **Render** the pipeline from the event stream (see mapping below), updating
   each stage/investigator card as events arrive.
4. When `root_cause.completed` / `investigation.completed` arrive, **fetch** the
   final state: `GET /api/v1/incidents/:id` (or `…/investigations/:id/root-cause`).

## Consuming SSE

```js
const es = new EventSource(`/api/v1/incidents/${id}/events/stream`);
es.onmessage = (e) => {
  const event = JSON.parse(e.data); // { seq, id, incidentId, timestamp, type, actor, payload }
  applyEvent(event);
};
// The browser automatically reconnects and sends Last-Event-ID; the server
// replays only events after that seq. Each message also has an SSE `event:`
// field equal to the event type, if you prefer addEventListener(type, …).
es.onerror = () => {/* EventSource auto-reconnects */};
```

Events are scoped to the incident — you never receive another incident's events.
If a client disconnects, the investigation keeps running; reconnect to catch up.

## Mapping events → UI

| Event | UI effect |
|---|---|
| `incident.created`, `investigation.started` | show incident header, mark investigation QUEUED→RUNNING |
| `session.created` | show the TrueForge session (mode: harness/local) |
| `commander.started` | activate the Incident Commander node |
| `investigator.started` (actor = investigator) | set that investigator card RUNNING |
| `investigator.tool_called` / `tool_completed` | show tool activity + `payload.tool` |
| `approval.requested` → `approval.granted`/`denied`/`timeout` | show the human-in-the-loop gate + outcome |
| `investigator.completed` / `failed` | set card COMPLETE/FAILED (+ `payload.confidence`, `severity`) |
| `evidence.fusion_started` / `fusion_completed` | fusion stage; `payload.hypothesis`, `payload.confidence` |
| `code_investigator.*`, `sandbox.*` | Code Investigator card + sandbox activity/driver |
| `root_cause.started` / `completed` | root-cause stage; `payload.title`, `confidence`, `status` |
| `investigation.completed` / `failed` | finalize; then GET the incident for full findings + root cause |

Investigator status values for cards: `QUEUED | RUNNING | COMPLETE | FAILED`
(derive QUEUED before `investigator.started`, RUNNING after, COMPLETE/FAILED on
`investigator.completed`/`failed`).

## Error handling

Every error is `{ data: null, error: { code, message, fields? } }`. Validation
failures are `400` with `error.code = "VALIDATION"` and `error.fields` keyed by
field path. Show `error.message`; never expect a stack trace.

## Polling fallback

If SSE is unavailable, poll `GET /api/v1/incidents/:id/events?afterSeq=<lastSeq>`
and advance `afterSeq` with `nextCursor`.
