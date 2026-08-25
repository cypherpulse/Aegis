import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { AppError } from "./auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProtocolRoutes } from "./routes/protocols.js";
import { registerInvestigationRoutes } from "./routes/investigation.js";
import {
  getAgentEvents,
  getIncident,
  getActiveInvestigation,
  getInvestigation,
  getLatestInvestigation,
  getRootCause,
  createIncident,
  createInvestigation,
  listFindings,
  listIncidents,
  pingDb,
  type DbHandle,
  type StoredEvent,
} from "@aegis/database";
import { err, ok } from "@aegis/shared";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { EventPublisher } from "./events.js";
import {
  buildIncident,
  CreateIncidentSchema,
  type CreateIncidentInput,
} from "./incident-factory.js";
import { InvestigationJobRunner } from "./jobs.js";

export interface BuildAppOptions {
  db: DbHandle;
  corsOrigins?: string[] | boolean;
  logger?: boolean;
}

export interface BuiltApp {
  app: FastifyInstance;
  publisher: EventPublisher;
  jobs: InvestigationJobRunner;
}

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  status: z.string().optional(),
  severity: z.string().optional(),
  chain: z.string().optional(),
  protocol: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const eventsQuery = z.object({
  afterSeq: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
type EventsQuery = z.infer<typeof eventsQuery>;

export async function buildApp(opts: BuildAppOptions): Promise<BuiltApp> {
  const { db } = opts.db;
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 256 * 1024 });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const publisher = new EventPublisher(db, (e) =>
    app.log.error({ err: e }, "event publish failed"),
  );
  const jobs = new InvestigationJobRunner(db, publisher, (e) =>
    app.log.error({ err: e }, "investigation job failed"),
  );

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: opts.corsOrigins ?? true, credentials: true });
  await app.register(
    cookie,
    process.env.SESSION_SECRET ? { secret: process.env.SESSION_SECRET } : {},
  );
  await app.register(swagger, {
    openapi: {
      info: { title: "Aegis API", version: "1.0.0" },
      servers: [{ url: "/" }],
    },
    transform: jsonSchemaTransform,
  });

  // Consistent, stack-free error envelope (§12/§32).
  app.setErrorHandler((error: FastifyError, req, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send(err(error.code, error.message));
      return;
    }
    if (error.validation || error.code === "FST_ERR_VALIDATION") {
      const fields: Record<string, string> = {};
      for (const issue of error.validation ?? []) {
        const key =
          issue.instancePath ||
          (issue.params as { issue?: { path?: (string | number)[] } })?.issue
            ?.path?.join(".") ||
          "body";
        fields[key] = issue.message ?? "invalid";
      }
      reply
        .code(400)
        .send(
          err(
            "VALIDATION",
            "Invalid request",
            Object.keys(fields).length ? fields : undefined,
          ),
        );
      return;
    }
    const status =
      typeof error.statusCode === "number" && error.statusCode < 500
        ? error.statusCode
        : 500;
    if (status >= 500) req.log.error({ err: error }, "request failed");
    reply
      .code(status)
      .send(
        err(
          status >= 500 ? "INTERNAL" : "ERROR",
          status >= 500 ? "Internal server error" : error.message,
        ),
      );
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send(err("NOT_FOUND", "Resource not found"));
  });

  const api = "/api/v1";

  // ---- Health + OpenAPI --------------------------------------------------
  app.get("/health", async () => ok({ status: "ok" }));
  app.get("/ready", async (_req, reply) => {
    const dbOk = await pingDb(db);
    reply
      .code(dbOk ? 200 : 503)
      .send(ok({ status: dbOk ? "ready" : "degraded", db: dbOk }));
  });
  app.get("/api/openapi.json", async () => app.swagger());

  // ---- Incidents ---------------------------------------------------------
  app.post<{ Body: CreateIncidentInput }>(
    `${api}/incidents`,
    { schema: { body: CreateIncidentSchema } },
    async (req, reply) => {
      const incident = buildIncident(req.body);
      await createIncident(db, incident);
      const investigation = await createInvestigation(db, {
        incidentId: incident.id,
      });
      jobs.enqueue(incident, investigation.id);
      reply.code(202).send(
        ok({
          incidentId: incident.id,
          investigationId: investigation.id,
          status: "QUEUED",
        }),
      );
    },
  );

  app.get<{ Querystring: ListQuery }>(
    `${api}/incidents`,
    { schema: { querystring: listQuery } },
    async (req) => {
      const { protocol, ...rest } = req.query;
      return ok(
        await listIncidents(db, {
          ...rest,
          ...(protocol ? { protocolId: protocol } : {}),
        }),
      );
    },
  );

  app.get<{ Params: { id: string } }>(
    `${api}/incidents/:id`,
    { schema: { params: idParam } },
    async (req, reply) => {
      const incident = await getIncident(db, req.params.id);
      if (!incident) {
        reply.code(404).send(err("NOT_FOUND", "Incident not found"));
        return;
      }
      const investigation = await getLatestInvestigation(db, incident.id);
      const findings = investigation
        ? await listFindings(db, investigation.id)
        : [];
      const rootCause = investigation
        ? await getRootCause(db, investigation.id)
        : null;
      reply.send(
        ok({
          incident,
          investigation,
          stage: investigation?.stage ?? null,
          findings,
          rootCause,
        }),
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    `${api}/incidents/:id/investigate`,
    { schema: { params: idParam } },
    async (req, reply) => {
      const incident = await getIncident(db, req.params.id);
      if (!incident) {
        reply.code(404).send(err("NOT_FOUND", "Incident not found"));
        return;
      }
      // Idempotent: return the existing active investigation if present (§28).
      const existing = await getActiveInvestigation(db, incident.id);
      if (existing) {
        reply.send(ok({ investigationId: existing.id, status: existing.status }));
        return;
      }
      const investigation = await createInvestigation(db, {
        incidentId: incident.id,
      });
      jobs.enqueue(incident, investigation.id);
      reply
        .code(202)
        .send(ok({ investigationId: investigation.id, status: "QUEUED" }));
    },
  );

  app.get<{ Params: { id: string }; Querystring: EventsQuery }>(
    `${api}/incidents/:id/events`,
    { schema: { params: idParam, querystring: eventsQuery } },
    async (req) => {
      const events = await getAgentEvents(db, req.params.id, {
        ...(req.query.afterSeq !== undefined
          ? { afterSeq: req.query.afterSeq }
          : {}),
        ...(req.query.limit !== undefined ? { limit: req.query.limit } : {}),
      });
      const nextCursor =
        events.length > 0 ? String(events[events.length - 1]!.seq) : null;
      return ok({ items: events, nextCursor });
    },
  );

  // ---- SSE stream --------------------------------------------------------
  app.get<{ Params: { id: string }; Querystring: { afterSeq?: string } }>(
    `${api}/incidents/:id/events/stream`,
    async (req, reply) => {
      const incidentId = req.params.id;
      const incident = await getIncident(db, incidentId);
      if (!incident) {
        reply.code(404).send(err("NOT_FOUND", "Incident not found"));
        return;
      }

      const headerId = req.headers["last-event-id"];
      const lastEventId = Number(
        (Array.isArray(headerId) ? headerId[0] : headerId) ??
          req.query.afterSeq ??
          0,
      );
      let lastSeq = Number.isFinite(lastEventId) ? lastEventId : 0;

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const write = (e: StoredEvent): void => {
        raw.write(`id: ${e.seq}\n`);
        raw.write(`event: ${e.type}\n`);
        raw.write(`data: ${JSON.stringify(e)}\n\n`);
      };

      const history = await getAgentEvents(db, incidentId, {
        afterSeq: lastSeq,
        limit: 500,
      });
      for (const e of history) {
        write(e);
        lastSeq = e.seq;
      }

      const unsub = publisher.subscribe(incidentId, (e) => {
        if (e.seq > lastSeq) {
          write(e);
          lastSeq = e.seq;
        }
      });

      const ping = setInterval(() => raw.write(": ping\n\n"), 15000);
      req.raw.on("close", () => {
        clearInterval(ping);
        unsub();
        raw.end();
      });
    },
  );

  // ---- Investigations ----------------------------------------------------
  app.get<{ Params: { id: string } }>(
    `${api}/investigations/:id`,
    { schema: { params: idParam } },
    async (req, reply) => {
      const investigation = await getInvestigation(db, req.params.id);
      if (!investigation) {
        reply.code(404).send(err("NOT_FOUND", "Investigation not found"));
        return;
      }
      const findings = await listFindings(db, investigation.id);
      const rootCause = await getRootCause(db, investigation.id);
      reply.send(ok({ investigation, findings, rootCause }));
    },
  );

  app.get<{ Params: { id: string } }>(
    `${api}/investigations/:id/findings`,
    { schema: { params: idParam } },
    async (req) => ok({ findings: await listFindings(db, req.params.id) }),
  );

  app.get<{ Params: { id: string } }>(
    `${api}/investigations/:id/root-cause`,
    { schema: { params: idParam } },
    async (req, reply) => {
      const rootCause = await getRootCause(db, req.params.id);
      if (!rootCause) {
        reply.code(404).send(err("NOT_FOUND", "Root cause not available yet"));
        return;
      }
      reply.send(ok({ rootCause }));
    },
  );

  // ---- Platform resources + auth + rich investigation views --------------
  registerAuthRoutes(app, db);
  registerProtocolRoutes(app, db);
  registerInvestigationRoutes(app, db);

  await app.ready();
  return { app, publisher, jobs };
}
