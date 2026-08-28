import {
  createInvestigation,
  getActiveInvestigation,
  getIncident,
  getIncidentOwner,
  getLatestInvestigation,
  getRootCause,
  listFindings,
  listIncidents,
  listProtocolsForUser,
  type Database,
} from "@aegis/database";
import { getContractActivity, resolveChain } from "@aegis/blockchain";
import { z } from "zod";
import type { InvestigationJobRunner } from "../jobs.js";

/** Everything a tool handler may touch. Data access is scoped to the user. */
export interface AssistantCtx {
  db: Database;
  jobs: InvestigationJobRunner;
  authOn: boolean;
  userId: string;
  /** Protocol ids the user owns/belongs to (for incident scoping). */
  ownerProtocolIds: string[];
}

/** A LangGraph-style tool: a name, a description, typed params, and the fn it calls. */
export interface AssistantTool {
  name: string;
  description: string;
  /** Human/LLM-readable hint of the argument shape. */
  parametersHint: string;
  parameters: z.ZodTypeAny;
  handler: (args: unknown, ctx: AssistantCtx) => Promise<unknown>;
}

// ---- Scoping helpers ----------------------------------------------------

function incidentScope(ctx: AssistantCtx): Record<string, unknown> {
  if (!ctx.authOn) return {};
  return { ownerUserId: ctx.userId, ownerProtocolIds: ctx.ownerProtocolIds };
}

async function assertCanView(ctx: AssistantCtx, incidentId: string): Promise<boolean> {
  if (!ctx.authOn) return true;
  const owner = await getIncidentOwner(ctx.db, incidentId);
  if (!owner) return false;
  if (!owner.createdByUserId && !owner.protocolId) return true; // public pool
  if (owner.createdByUserId === ctx.userId) return true;
  return owner.protocolId ? ctx.ownerProtocolIds.includes(owner.protocolId) : false;
}

// ---- Tools --------------------------------------------------------------

export const assistantTools: AssistantTool[] = [
  {
    name: "list_incidents",
    description:
      "List the user's incidents (most recent first). Optionally filter by status or severity.",
    parametersHint: '{ "status"?: string, "severity"?: "LOW|MEDIUM|HIGH|CRITICAL", "limit"?: number }',
    parameters: z.object({
      status: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().int().positive().max(50).optional(),
    }),
    handler: async (args, ctx) => {
      const a = args as { status?: string; severity?: string; limit?: number };
      const page = await listIncidents(ctx.db, {
        ...incidentScope(ctx),
        ...(a.status ? { status: a.status } : {}),
        ...(a.severity ? { severity: a.severity } : {}),
        limit: a.limit ?? 15,
      });
      return {
        total: page.total,
        incidents: page.items.map((i) => ({
          id: i.id,
          title: i.title,
          severity: i.severity,
          chain: i.chain.name,
          status: i.status,
        })),
      };
    },
  },
  {
    name: "get_incident",
    description:
      "Get one incident's full analysis: its details, every investigator finding, and the root cause.",
    parametersHint: '{ "incidentId": "INC_..." }',
    parameters: z.object({ incidentId: z.string().min(1) }),
    handler: async (args, ctx) => {
      const { incidentId } = args as { incidentId: string };
      if (!(await assertCanView(ctx, incidentId))) return { error: "Incident not found." };
      const incident = await getIncident(ctx.db, incidentId);
      if (!incident) return { error: "Incident not found." };
      const inv = await getLatestInvestigation(ctx.db, incidentId);
      const findings = inv ? await listFindings(ctx.db, inv.id) : [];
      const rc = inv ? await getRootCause(ctx.db, inv.id) : null;
      return {
        incident: {
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          chain: incident.chain.name,
          status: incident.status,
          description: incident.description,
        },
        investigation: inv ? { id: inv.id, status: inv.status, stage: inv.stage } : null,
        findings: findings.map((f) => ({
          investigator: f.investigator,
          status: f.status,
          confidence: f.confidence,
          severity: f.severity,
          summary: f.summary,
        })),
        rootCause: rc
          ? { status: rc.status, confidence: rc.confidence, title: rc.title, explanation: rc.explanation }
          : null,
      };
    },
  },
  {
    name: "investigate_incident",
    description:
      "Launch a real multi-agent investigation for an incident. Returns the investigation id. Idempotent if one is already running.",
    parametersHint: '{ "incidentId": "INC_..." }',
    parameters: z.object({ incidentId: z.string().min(1) }),
    handler: async (args, ctx) => {
      const { incidentId } = args as { incidentId: string };
      if (!(await assertCanView(ctx, incidentId))) return { error: "Incident not found." };
      const incident = await getIncident(ctx.db, incidentId);
      if (!incident) return { error: "Incident not found." };
      const existing = await getActiveInvestigation(ctx.db, incidentId);
      if (existing) return { status: "already_running", investigationId: existing.id };
      const inv = await createInvestigation(ctx.db, { incidentId });
      ctx.jobs.enqueue(incident, inv.id);
      return { status: "started", investigationId: inv.id };
    },
  },
  {
    name: "list_protocols",
    description: "List the protocols the user owns or belongs to.",
    parametersHint: "{}",
    parameters: z.object({}).optional(),
    handler: async (_args, ctx) => {
      if (!ctx.authOn) return { protocols: [], note: "demo mode — protocols are not user-scoped" };
      const page = await listProtocolsForUser(ctx.db, ctx.userId, { limit: 50 });
      return {
        protocols: page.items.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          primaryChain: p.primaryChain,
          status: p.status,
        })),
      };
    },
  },
  {
    name: "get_contract_activity",
    description:
      "Read REAL on-chain activity for an address on its network via public RPC: native balance, whether it is a contract, and recent ERC-20 Transfer events. Supports Ethereum, Base, Arbitrum, Optimism, Polygon, Solana, Stacks.",
    parametersHint: '{ "chain": "Base|Ethereum|Arbitrum|Optimism|Polygon|Solana|Stacks", "address": "0x... or chain address" }',
    parameters: z.object({ chain: z.string().min(1), address: z.string().min(1) }),
    handler: async (args) => {
      const { chain, address } = args as { chain: string; address: string };
      const info = resolveChain(chain);
      if (!info) return { error: `Unknown chain "${chain}".` };
      try {
        return await getContractActivity(info.key, address);
      } catch (e) {
        return { error: `On-chain read failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  },
];

export const toolByName = new Map(assistantTools.map((t) => [t.name, t]));
