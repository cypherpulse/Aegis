# Aegis — Web Console

The Aegis operator console and landing page. It consumes the Aegis backend
exclusively over its **REST + SSE** API — it never imports backend packages,
touches the database, or calls TrueForge/MCP directly.

## Stack

- TanStack Start (SSR + file-based routing) · React 19 · TypeScript
- Tailwind CSS v4 · shadcn/ui (Radix) · lucide-react
- TanStack Query for data fetching; a small typed API + SSE client

## Getting started

The backend must be running first (see the repo root README):

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm --filter @aegis/api dev        # API on http://localhost:4000
```

Then, from `apps/web`:

```bash
cp .env.example .env                # set VITE_API_BASE_URL if not localhost:4000
bun install
bun run dev                         # console on http://localhost:3000
```

Scripts: `bun run dev`, `bun run build`, `bun run preview`, `bun run lint`.

## What it does

- **Landing** (`/`) — product story: hero pipeline, the four evidence surfaces,
  TrueForge, and the safety/approval boundary. "Launch Investigation" creates an
  incident and opens its console.
- **Incidents** (`/incidents`) — list incidents; launch a new investigation.
- **Investigation console** (`/incidents/:incidentId`) — the live pipeline
  (TrueForge session → commander → investigators → fusion → code → sandbox → root
  cause) driven by SSE, plus the live event timeline, evidence, approval gate, and
  the final root cause.

## Architecture

```
src/
  routes/            index (landing), incidents, incidents.$incidentId
  components/        layout · pipeline · events · evidence · investigation · ui (shadcn)
  hooks/             useIncidents · useIncident · useIncidentEvents
  services/          api.ts (REST, {data,error} envelope) · sse.ts (EventSource)
  lib/               pipeline.ts (event → state reducer) · event-copy.ts
  types/             api.ts · events.ts  (typed against the backend contract)
```

The event → pipeline-state mapping lives in `src/lib/pipeline.ts` (pure and
unit-testable). Configuration is a single public variable, `VITE_API_BASE_URL` —
no secrets are ever exposed to the client.
