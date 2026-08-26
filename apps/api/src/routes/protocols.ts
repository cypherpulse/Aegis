import { isValidAddressForChain, resolveChain } from "@aegis/blockchain";
import {
  archiveProtocol,
  createContract,
  createIncident,
  createIntegrationKey,
  createInvestigation,
  createProtocol,
  createTreasury,
  deleteContract,
  deleteProtocol,
  deleteTreasury,
  getContract,
  unarchiveProtocol,
  getIntegrationKeyByPrefix,
  getMonitoring,
  getTreasury,
  listContracts,
  listIntegrationKeys,
  listProtocolsForUser,
  listTreasury,
  revokeIntegrationKey,
  slugExists,
  touchIntegrationKey,
  updateContract,
  updateMonitoring,
  updateProtocol,
  updateTreasury,
  getIntegrationKeyById,
  type ContractRecord,
  type Database,
  type IntegrationKeyRecord,
  type MonitoringRecord,
  type ProtocolRecord,
  type TreasuryRecord,
} from "@aegis/database";
import { err, genId, nowIso, ok, type Incident } from "@aegis/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { InvestigationJobRunner } from "../jobs.js";

import {
  AppError,
  generateIntegrationKey,
  hashIntegrationKey,
  parseIntegrationKey,
  requireProtocolAccess,
  requireUser,
} from "../auth.js";

const CHAIN_IDS: Record<string, number> = {
  "Base Sepolia": 84532,
  Base: 8453,
  Ethereum: 1,
  "Ethereum Sepolia": 11155111,
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const protocolDto = (p: ProtocolRecord) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  description: p.description,
  website: p.website,
  primaryChain: p.primaryChain,
  githubRepository: p.githubRepository,
  status: p.status,
  archivedAt: p.archivedAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});
const contractDto = (c: ContractRecord) => ({
  id: c.id,
  protocolId: c.protocolId,
  name: c.name,
  chain: c.chain,
  address: c.address,
  type: c.type,
  status: c.status,
  metadata: c.metadata,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});
const treasuryDto = (t: TreasuryRecord) => ({
  id: t.id,
  protocolId: t.protocolId,
  address: t.address,
  chain: t.chain,
  label: t.label,
  status: t.status,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});
const monitoringDto = (m: MonitoringRecord) => ({
  protocolId: m.protocolId,
  contractMonitoring: m.contractMonitoring,
  treasuryMonitoring: m.treasuryMonitoring,
  applicationMonitoring: m.applicationMonitoring,
  config: m.config,
  updatedAt: m.updatedAt,
});
/** Never includes the secret or its hash. */
const keyDto = (k: IntegrationKeyRecord) => ({
  id: k.id,
  protocolId: k.protocolId,
  name: k.name,
  keyPrefix: k.keyPrefix,
  lastUsedAt: k.lastUsedAt,
  createdAt: k.createdAt,
  revokedAt: k.revokedAt,
});

const CreateProtocol = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).optional(),
  description: z.string().max(2000).optional(),
  website: z.string().url().optional(),
  primaryChain: z.string().max(60).optional(),
  githubRepository: z.string().max(300).optional(),
});

const CreateContract = z.object({
  name: z.string().min(1),
  chain: z.string().min(1),
  address: z.string().min(1),
  type: z.string().optional(),
  status: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const CreateTreasury = z.object({
  address: z.string().min(1),
  chain: z.string().min(1),
  label: z.string().optional(),
  status: z.string().optional(),
});

const IngestIncident = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  chain: z.string().min(1),
  contractAddress: z.string().optional(),
  transactionHash: z.string().optional(),
  blockNumber: z.number().int().optional(),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Authenticate an ingestion request via x-api-key OR a session; returns the protocolId scope. */
async function authenticateIngestion(
  db: Database,
  req: FastifyRequest,
  protocolId: string,
): Promise<void> {
  const header = req.headers["x-api-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw) {
    const parsed = parseIntegrationKey(raw);
    if (!parsed) throw new AppError(401, "UNAUTHORIZED", "Malformed API key");
    const key = await getIntegrationKeyByPrefix(db, parsed.prefix);
    if (!key || key.revokedAt || key.keyHash !== hashIntegrationKey(raw)) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid API key");
    }
    if (key.protocolId !== protocolId) {
      throw new AppError(403, "FORBIDDEN", "API key does not match this protocol");
    }
    await touchIntegrationKey(db, key.id);
    return;
  }
  await requireProtocolAccess(db, req, protocolId);
}

export function registerProtocolRoutes(
  app: FastifyInstance,
  db: Database,
  jobs: InvestigationJobRunner,
): void {
  const base = "/api/v1/protocols";

  // ---- Protocols ----
  app.post(`${base}`, { schema: { body: CreateProtocol } }, async (req, reply) => {
    const user = await requireUser(db, req);
    const body = req.body as z.infer<typeof CreateProtocol>;
    const slug = body.slug ? slugify(body.slug) : slugify(body.name);
    if (!slug) {
      reply.code(422).send(err("VALIDATION", "Could not derive a slug from the name"));
      return;
    }
    if (await slugExists(db, slug)) {
      reply.code(409).send(err("CONFLICT", "A protocol with this slug already exists"));
      return;
    }
    const protocol = await createProtocol(db, {
      ownerUserId: user.id,
      name: body.name,
      slug,
      description: body.description ?? null,
      website: body.website ?? null,
      primaryChain: body.primaryChain ?? null,
      githubRepository: body.githubRepository ?? null,
    });
    reply.code(201).send(ok(protocolDto(protocol)));
  });

  app.get(
    `${base}`,
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(100).optional(),
          offset: z.coerce.number().int().nonnegative().optional(),
        }),
      },
    },
    async (req, reply) => {
      const user = await requireUser(db, req);
      const q = req.query as { limit?: number; offset?: number };
      const page = await listProtocolsForUser(db, user.id, q);
      reply.send(ok({ ...page, items: page.items.map(protocolDto) }));
    },
  );

  app.get<{ Params: { id: string } }>(`${base}/:id`, async (req, reply) => {
    const { protocol } = await requireProtocolAccess(db, req, req.params.id);
    reply.send(ok(protocolDto(protocol)));
  });

  app.patch<{ Params: { id: string } }>(
    `${base}/:id`,
    {
      schema: {
        body: z.object({
          name: z.string().min(1).optional(),
          description: z.string().max(2000).optional(),
          website: z.string().url().optional(),
          primaryChain: z.string().optional(),
          githubRepository: z.string().optional(),
        }),
      },
    },
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const updated = await updateProtocol(db, req.params.id, req.body as Record<string, string>);
      reply.send(ok(updated ? protocolDto(updated) : null));
    },
  );

  // Soft-archive (pauses monitoring, keeps history) vs permanent delete.
  app.post<{ Params: { id: string } }>(`${base}/:id/archive`, async (req, reply) => {
    await requireProtocolAccess(db, req, req.params.id);
    const updated = await archiveProtocol(db, req.params.id);
    reply.send(ok(updated ? protocolDto(updated) : null));
  });

  app.post<{ Params: { id: string } }>(`${base}/:id/unarchive`, async (req, reply) => {
    await requireProtocolAccess(db, req, req.params.id);
    const updated = await unarchiveProtocol(db, req.params.id);
    reply.send(ok(updated ? protocolDto(updated) : null));
  });

  app.delete<{ Params: { id: string } }>(`${base}/:id`, async (req, reply) => {
    await requireProtocolAccess(db, req, req.params.id);
    await deleteProtocol(db, req.params.id);
    reply.code(204).send();
  });

  // ---- Contracts ----
  app.post<{ Params: { id: string } }>(
    `${base}/:id/contracts`,
    { schema: { body: CreateContract } },
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const body = req.body as z.infer<typeof CreateContract>;
      if (!isValidAddressForChain(body.chain, body.address)) {
        reply.code(422).send(err("VALIDATION", "Invalid contract address", { address: "invalid" }));
        return;
      }
      const contract = await createContract(db, { protocolId: req.params.id, ...body });
      reply.code(201).send(ok(contractDto(contract)));
    },
  );

  app.get<{ Params: { id: string } }>(`${base}/:id/contracts`, async (req, reply) => {
    await requireProtocolAccess(db, req, req.params.id);
    const items = await listContracts(db, req.params.id);
    reply.send(ok({ items: items.map(contractDto) }));
  });

  app.get<{ Params: { id: string; contractId: string } }>(
    `${base}/:id/contracts/:contractId`,
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const c = await getContract(db, req.params.contractId);
      if (!c || c.protocolId !== req.params.id) {
        reply.code(404).send(err("NOT_FOUND", "Contract not found"));
        return;
      }
      reply.send(ok(contractDto(c)));
    },
  );

  // Launch a real agent investigation for a specific contract. Lets a user
  // kick off the multi-agent pipeline on a contract they just added.
  app.post<{ Params: { id: string; contractId: string } }>(
    `${base}/:id/contracts/:contractId/investigate`,
    async (req, reply) => {
      const { user } = await requireProtocolAccess(db, req, req.params.id);
      const c = await getContract(db, req.params.contractId);
      if (!c || c.protocolId !== req.params.id) {
        reply.code(404).send(err("NOT_FOUND", "Contract not found"));
        return;
      }
      const chain = resolveChain(c.chain);
      const incident: Incident = {
        id: genId("INC"),
        type: "TREASURY_GAS_DEPLETION",
        severity: "HIGH",
        title: `Investigate contract ${c.name}`,
        description: `Manual investigation requested for ${c.name} (${c.address}) on ${c.chain}.`,
        affectedProtocol: req.params.id,
        chain: { name: c.chain, chainId: chain?.chainId ?? CHAIN_IDS[c.chain] ?? 0 },
        detectedAt: nowIso(),
        status: "DETECTED",
        metadata: {
          source: "contract_investigate",
          contractId: c.id,
          contractAddress: c.address,
          chain: c.chain,
        },
      };
      await createIncident(db, incident, req.params.id, user.id);
      const investigation = await createInvestigation(db, { incidentId: incident.id });
      jobs.enqueue(incident, investigation.id);
      reply.code(202).send(
        ok({ incidentId: incident.id, investigationId: investigation.id, status: "QUEUED" }),
      );
    },
  );

  app.patch<{ Params: { id: string; contractId: string } }>(
    `${base}/:id/contracts/:contractId`,
    {
      schema: {
        body: z.object({
          name: z.string().optional(),
          type: z.string().optional(),
          status: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      },
    },
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const c = await getContract(db, req.params.contractId);
      if (!c || c.protocolId !== req.params.id) {
        reply.code(404).send(err("NOT_FOUND", "Contract not found"));
        return;
      }
      const updated = await updateContract(db, req.params.contractId, req.body as Record<string, never>);
      reply.send(ok(updated ? contractDto(updated) : null));
    },
  );

  app.delete<{ Params: { id: string; contractId: string } }>(
    `${base}/:id/contracts/:contractId`,
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const c = await getContract(db, req.params.contractId);
      if (!c || c.protocolId !== req.params.id) {
        reply.code(404).send(err("NOT_FOUND", "Contract not found"));
        return;
      }
      await deleteContract(db, req.params.contractId);
      reply.code(204).send();
    },
  );

  // ---- Treasury ----
  app.post<{ Params: { id: string } }>(
    `${base}/:id/treasury`,
    { schema: { body: CreateTreasury } },
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const body = req.body as z.infer<typeof CreateTreasury>;
      if (!isValidAddressForChain(body.chain, body.address)) {
        reply.code(422).send(err("VALIDATION", "Invalid treasury address", { address: "invalid" }));
        return;
      }
      const t = await createTreasury(db, { protocolId: req.params.id, ...body });
      reply.code(201).send(ok(treasuryDto(t)));
    },
  );

  app.get<{ Params: { id: string } }>(`${base}/:id/treasury`, async (req, reply) => {
    await requireProtocolAccess(db, req, req.params.id);
    const items = await listTreasury(db, req.params.id);
    reply.send(ok({ items: items.map(treasuryDto) }));
  });

  app.patch<{ Params: { id: string; addressId: string } }>(
    `${base}/:id/treasury/:addressId`,
    { schema: { body: z.object({ label: z.string().optional(), status: z.string().optional() }) } },
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const t = await getTreasury(db, req.params.addressId);
      if (!t || t.protocolId !== req.params.id) {
        reply.code(404).send(err("NOT_FOUND", "Treasury address not found"));
        return;
      }
      const updated = await updateTreasury(db, req.params.addressId, req.body as Record<string, string>);
      reply.send(ok(updated ? treasuryDto(updated) : null));
    },
  );

  app.delete<{ Params: { id: string; addressId: string } }>(
    `${base}/:id/treasury/:addressId`,
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const t = await getTreasury(db, req.params.addressId);
      if (!t || t.protocolId !== req.params.id) {
        reply.code(404).send(err("NOT_FOUND", "Treasury address not found"));
        return;
      }
      await deleteTreasury(db, req.params.addressId);
      reply.code(204).send();
    },
  );

  // ---- Monitoring ----
  app.get<{ Params: { id: string } }>(`${base}/:id/monitoring`, async (req, reply) => {
    await requireProtocolAccess(db, req, req.params.id);
    const m = await getMonitoring(db, req.params.id);
    reply.send(ok(monitoringDto(m)));
  });

  app.patch<{ Params: { id: string } }>(
    `${base}/:id/monitoring`,
    {
      schema: {
        body: z.object({
          contractMonitoring: z.boolean().optional(),
          treasuryMonitoring: z.boolean().optional(),
          applicationMonitoring: z.boolean().optional(),
          config: z.record(z.string(), z.unknown()).optional(),
        }),
      },
    },
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const m = await updateMonitoring(db, req.params.id, req.body as Record<string, never>);
      reply.send(ok(monitoringDto(m)));
    },
  );

  // ---- Integration keys ----
  app.post<{ Params: { id: string } }>(
    `${base}/:id/integration-keys`,
    { schema: { body: z.object({ name: z.string().min(1).max(120) }) } },
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const { raw, prefix, hash } = generateIntegrationKey();
      const key = await createIntegrationKey(db, {
        protocolId: req.params.id,
        name: (req.body as { name: string }).name,
        keyPrefix: prefix,
        keyHash: hash,
      });
      // The secret is returned exactly once.
      reply.code(201).send(ok({ ...keyDto(key), secret: raw }));
    },
  );

  app.get<{ Params: { id: string } }>(`${base}/:id/integration-keys`, async (req, reply) => {
    await requireProtocolAccess(db, req, req.params.id);
    const items = await listIntegrationKeys(db, req.params.id);
    reply.send(ok({ items: items.map(keyDto) }));
  });

  app.delete<{ Params: { id: string; keyId: string } }>(
    `${base}/:id/integration-keys/:keyId`,
    async (req, reply) => {
      await requireProtocolAccess(db, req, req.params.id);
      const key = await getIntegrationKeyById(db, req.params.keyId);
      if (!key || key.protocolId !== req.params.id) {
        reply.code(404).send(err("NOT_FOUND", "Integration key not found"));
        return;
      }
      await revokeIntegrationKey(db, req.params.keyId);
      reply.code(204).send();
    },
  );

  // ---- Protocol-scoped incident ingestion (session OR x-api-key) ----
  app.post<{ Params: { protocolId: string } }>(
    `${base}/:protocolId/incidents`,
    { schema: { body: IngestIncident } },
    async (req, reply) => {
      const protocolId = req.params.protocolId;
      await authenticateIngestion(db, req, protocolId);
      const body = req.body as z.infer<typeof IngestIncident>;
      const incident: Incident = {
        id: genId("INC"),
        type: "TREASURY_GAS_DEPLETION",
        severity: body.severity ?? "HIGH",
        title: body.title,
        description: body.description,
        affectedProtocol: protocolId,
        chain: { name: body.chain, chainId: CHAIN_IDS[body.chain] ?? 0 },
        detectedAt: nowIso(),
        status: "DETECTED",
        metadata: {
          source: body.source ?? "api",
          ...(body.contractAddress ? { contractAddress: body.contractAddress } : {}),
          ...(body.transactionHash ? { transactionHash: body.transactionHash } : {}),
          ...(body.blockNumber !== undefined ? { blockNumber: body.blockNumber } : {}),
          ...(body.metadata ?? {}),
        },
      };
      await createIncident(db, incident, protocolId);
      reply.code(201).send(ok({ incidentId: incident.id, protocolId, status: "DETECTED" }));
    },
  );
}
