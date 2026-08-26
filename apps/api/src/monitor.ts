import {
  createIncident,
  createInvestigation,
  getProtocol,
  listContracts,
  listMonitoredProtocols,
  listTreasury,
  type Database,
} from "@aegis/database";
import {
  getErc20Transfers as realGetErc20Transfers,
  getLatestBlockNumber as realGetLatestBlockNumber,
  getNativeBalance as realGetNativeBalance,
  resolveChain,
  type ChainInfo,
  type Erc20Transfer,
} from "@aegis/blockchain";
import { genId, nowIso, type Incident, type Severity } from "@aegis/shared";
import type { InvestigationJobRunner } from "./jobs.js";

// ---- Pure detection logic (unit-tested) --------------------------------

/** Native outflow ≥ threshold since the previous observation. */
export function detectBalanceDrop(
  prev: bigint | undefined,
  current: bigint,
  threshold: bigint,
): bigint | null {
  if (prev === undefined) return null;
  const drop = prev - current;
  return drop > 0n && drop >= threshold ? drop : null;
}

/** ERC-20 transfers at or above the threshold. */
export function largeTransfers(
  transfers: Erc20Transfer[],
  threshold: bigint,
): Erc20Transfer[] {
  return transfers.filter((t) => t.value >= threshold);
}

export function severityForAmount(amountWei: bigint, threshold: bigint): Severity {
  if (amountWei >= threshold * 10n) return "CRITICAL";
  if (amountWei >= threshold * 3n) return "HIGH";
  return "MEDIUM";
}

// ---- Monitor service ----------------------------------------------------

export interface ChainReader {
  getNativeBalance(key: string, address: string): Promise<bigint>;
  getLatestBlockNumber(key: string): Promise<bigint>;
  getErc20Transfers(key: string, contract: string, fromBlock: bigint): Promise<Erc20Transfer[]>;
}

const DEFAULT_READER: ChainReader = {
  getNativeBalance: realGetNativeBalance,
  getLatestBlockNumber: realGetLatestBlockNumber,
  getErc20Transfers: realGetErc20Transfers,
};

export interface MonitorOptions {
  intervalMs?: number;
  defaultThresholdWei?: bigint;
  reader?: ChainReader;
  onError?: (err: unknown) => void;
}

/**
 * Background monitor: polls each protocol's treasury (native outflows) and
 * contracts (ERC-20 transfers) on their mainnet chains, and when a movement
 * crosses the protocol's threshold it creates an incident and launches a real
 * investigation. Opt-in (MONITOR_ENABLED) and requires chain RPC access.
 */
export class MonitorService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly lastBalance = new Map<string, bigint>();
  private readonly lastBlock = new Map<string, bigint>();
  private readonly seenTx = new Set<string>();
  private readonly reader: ChainReader;
  private readonly intervalMs: number;
  private readonly defaultThreshold: bigint;
  private readonly onError: (err: unknown) => void;

  constructor(
    private readonly db: Database,
    private readonly jobs: InvestigationJobRunner,
    opts: MonitorOptions = {},
  ) {
    this.reader = opts.reader ?? DEFAULT_READER;
    this.intervalMs = opts.intervalMs ?? 30_000;
    this.defaultThreshold = opts.defaultThresholdWei ?? 10n ** 18n; // 1 ETH-equivalent
    this.onError = opts.onError ?? (() => {});
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.safeTick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async safeTick(): Promise<void> {
    if (this.running) return; // no overlapping ticks
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.onError(err);
    } finally {
      this.running = false;
    }
  }

  /** One monitoring pass. Exposed for tests. */
  async tick(): Promise<void> {
    const configs = await listMonitoredProtocols(this.db);
    for (const config of configs) {
      try {
        if (config.treasuryMonitoring) await this.checkTreasury(config.protocolId, config.config);
        if (config.contractMonitoring) await this.checkContracts(config.protocolId, config.config);
      } catch (err) {
        this.onError(err);
      }
    }
  }

  /** Resolve the alert threshold for a chain: protocol override, else per-chain default. */
  private thresholdFor(config: unknown, chain: ChainInfo): bigint {
    const raw = (config as { transferThresholdWei?: unknown })?.transferThresholdWei;
    if (typeof raw === "string" && /^\d+$/.test(raw)) return BigInt(raw);
    if (typeof raw === "number" && Number.isFinite(raw)) return BigInt(Math.floor(raw));
    // EVM keeps the env-configurable default; non-EVM uses the chain's base-unit default.
    return chain.family === "evm" ? this.defaultThreshold : chain.defaultThresholdBaseUnits;
  }

  private async checkTreasury(protocolId: string, config: unknown): Promise<void> {
    const addresses = await listTreasury(this.db, protocolId);
    for (const t of addresses) {
      const chain = resolveChain(t.chain);
      if (!chain || !chain.mainnet) continue;
      const threshold = this.thresholdFor(config, chain);
      const key = `${protocolId}:${chain.key}:${t.address.toLowerCase()}`;
      const balance = await this.reader.getNativeBalance(chain.key, t.address);
      const drop = detectBalanceDrop(this.lastBalance.get(key), balance, threshold);
      this.lastBalance.set(key, balance);
      if (drop !== null) {
        await this.raiseAlert(protocolId, {
          kind: "native_outflow",
          chainName: chain.name,
          chainId: chain.chainId,
          address: t.address,
          amountWei: drop,
          threshold,
        });
      }
    }
  }

  private async checkContracts(protocolId: string, config: unknown): Promise<void> {
    const contracts = await listContracts(this.db, protocolId);
    for (const c of contracts) {
      const chain = resolveChain(c.chain);
      if (!chain || !chain.mainnet) continue;
      // Token-transfer scanning is EVM-only (ERC-20 logs). Non-EVM contracts are
      // covered by treasury balance monitoring.
      if (chain.family !== "evm") continue;
      const threshold = this.thresholdFor(config, chain);
      const key = `${protocolId}:${chain.key}:${c.address.toLowerCase()}`;
      const latest = await this.reader.getLatestBlockNumber(chain.key);
      const from = this.lastBlock.get(key);
      this.lastBlock.set(key, latest);
      if (from === undefined) continue; // first pass establishes a baseline
      const transfers = await this.reader.getErc20Transfers(chain.key, c.address, from + 1n);
      for (const transfer of largeTransfers(transfers, threshold)) {
        if (this.seenTx.has(transfer.txHash)) continue;
        this.seenTx.add(transfer.txHash);
        await this.raiseAlert(protocolId, {
          kind: "large_transfer",
          chainName: chain.name,
          chainId: chain.chainId,
          address: c.address,
          amountWei: transfer.value,
          threshold,
          txHash: transfer.txHash,
        });
      }
    }
  }

  private async raiseAlert(
    protocolId: string,
    alert: {
      kind: string;
      chainName: string;
      chainId: number;
      address: string;
      amountWei: bigint;
      threshold: bigint;
      txHash?: string;
    },
  ): Promise<string> {
    const incident: Incident = {
      id: genId("INC"),
      type: "TREASURY_GAS_DEPLETION",
      severity: severityForAmount(alert.amountWei, alert.threshold),
      title:
        alert.kind === "native_outflow"
          ? `Large native outflow on ${alert.chainName}`
          : `Large transfer on ${alert.chainName}`,
      description: `Monitor detected a movement of ${alert.amountWei.toString()} wei involving ${alert.address} on ${alert.chainName}.`,
      affectedProtocol: protocolId,
      chain: { name: alert.chainName, chainId: alert.chainId },
      detectedAt: nowIso(),
      status: "DETECTED",
      metadata: {
        source: "monitor",
        alert: alert.kind,
        address: alert.address,
        valueWei: alert.amountWei.toString(),
        ...(alert.txHash ? { transactionHash: alert.txHash } : {}),
      },
    };
    // Attribute the auto-incident to the protocol owner so it lands in their scope.
    const protocol = await getProtocol(this.db, protocolId);
    await createIncident(this.db, incident, protocolId, protocol?.ownerUserId ?? null);
    const investigation = await createInvestigation(this.db, { incidentId: incident.id });
    this.jobs.enqueue(incident, investigation.id);
    return incident.id;
  }
}
