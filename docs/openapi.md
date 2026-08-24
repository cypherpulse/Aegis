# OpenAPI

The backend serves a live, generated OpenAPI 3 document at:

```
GET /api/openapi.json
```

It is produced by `@fastify/swagger` from the Fastify routes and the Zod request
schemas (via `fastify-type-provider-zod`), so it always reflects the **actual**
API — request bodies, params, and query strings for every endpoint. No endpoint
is documented that does not exist.

## Using it

- Import into Swagger UI, Postman, or an OpenAPI client generator.
- Generate a typed client for the frontend, e.g. with `openapi-typescript`:
  ```bash
  npx openapi-typescript http://localhost:4000/api/openapi.json -o src/api-types.ts
  ```

## Coverage

Paths documented: incidents (`POST/GET /api/v1/incidents`, `GET /api/v1/incidents/:id`,
`POST /api/v1/incidents/:id/investigate`, `GET /api/v1/incidents/:id/events`),
investigations (`GET /api/v1/investigations/:id`, `…/findings`, `…/root-cause`),
and health (`/health`, `/ready`).

## Notes

- **Request** shapes (body/query/params) are fully described by the generated
  schema. **Response** shapes and the `{ data, error }` envelope are documented
  in [api.md](api.md) (responses are returned untyped-by-schema to keep the
  envelope uniform).
- The SSE endpoint (`GET /api/v1/incidents/:id/events/stream`) is a streaming
  `text/event-stream` route; consume it as described in
  [frontend-integration.md](frontend-integration.md).
