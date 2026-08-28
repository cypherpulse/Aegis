import { listUserProtocolIds, type Database } from "@aegis/database";
import { TrueForgeSession } from "@aegis/trueforge";
import { genId, ok } from "@aegis/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authRequired, requireUser } from "../auth.js";
import type { InvestigationJobRunner } from "../jobs.js";
import { runAssistant } from "../assistant/agent.js";
import type { AssistantCtx } from "../assistant/tools.js";

const ChatBody = z.object({
  message: z.string().min(1).max(2000),
  incidentId: z.string().min(1).optional(),
});

/** Map agent tool-steps to UI action chips (frontend links to the incident). */
function actionsFromSteps(steps: { tool: string; args: unknown; observation: unknown }[]) {
  const actions: Array<{ type: string; incidentId: string; investigationId?: string }> = [];
  for (const s of steps) {
    if (s.tool !== "investigate_incident") continue;
    const args = s.args as { incidentId?: string };
    const obs = s.observation as { status?: string; investigationId?: string };
    if (!args.incidentId) continue;
    actions.push({
      type: obs.status === "already_running" ? "investigation_active" : "investigation_started",
      incidentId: args.incidentId,
      ...(obs.investigationId ? { investigationId: obs.investigationId } : {}),
    });
  }
  return actions;
}

export function registerAssistantRoutes(
  app: FastifyInstance,
  db: Database,
  jobs: InvestigationJobRunner,
): void {
  const base = "/api/v1/assistant";

  app.post<{ Body: z.infer<typeof ChatBody> }>(
    `${base}/chat`,
    { schema: { body: ChatBody } },
    async (req, reply) => {
      const user = await requireUser(db, req);
      const { message, incidentId } = req.body;
      const authOn = authRequired();

      const ctx: AssistantCtx = {
        db,
        jobs,
        authOn,
        userId: user.id,
        ownerProtocolIds: authOn ? await listUserProtocolIds(db, user.id) : [],
      };

      // The deployed aegis-commander agent drives the tool loop when reachable.
      const session = await TrueForgeSession.start({ incidentId: genId("chat"), emit: () => {} });
      const framed = incidentId ? `${message}\n\n(Context incident: ${incidentId})` : message;
      const result = await runAssistant(session, framed, ctx);

      reply.send(
        ok({
          reply: result.reply,
          mode: result.mode,
          actions: actionsFromSteps(result.steps),
          steps: result.steps.map((s) => ({ tool: s.tool, args: s.args })),
          ...(incidentId ? { incidentId } : {}),
        }),
      );
    },
  );
}
