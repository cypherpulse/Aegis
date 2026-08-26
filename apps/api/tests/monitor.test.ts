process.env.SANDBOX_DRIVER = "subprocess";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  createProtocol,
  createTreasury,
  ensureDevUser,
  listIncidents,
  runMigrations,
  truncateAll,
  updateMonitoring,
  type DbHandle,
} from "@aegis/database";
import type { Erc20Transfer } from "@aegis/blockchain";
import { buildApp } from "../src/app.js";
import type { InvestigationJobRunner } from "../src/jobs.js";
import {
  detectBalanceDrop,
  largeTransfers,
  MonitorService,
  severityForAmount,
} from "../src/monitor.js";

const ETH = 10n ** 18n;

describe("monitor detection (pure)", () => {
  it("detects a balance drop at/above threshold", () => {
    expect(detectBalanceDrop(10n * ETH, 5n * ETH, ETH)).toBe(5n * ETH);
    expect(detectBalanceDrop(10n * ETH, 10n * ETH - 1n, ETH)).toBeNull(); // below threshold
    expect(detectBalanceDrop(undefined, 5n * ETH, ETH)).toBeNull(); // no baseline
    expect(detectBalanceDrop(5n * ETH, 10n * ETH, ETH)).toBeNull(); // inflow
  });

  it("filters large ERC-20 transfers", () => {
    const t = (value: bigint, hash: string): Erc20Transfer => ({
      from: "0xa",
      to: "0xb",
      value,
      txHash: hash,
      blockNumber: 1n,
    });
    const big = largeTransfers([t(2n * ETH, "0x1"), t(ETH / 2n, "0x2")], ETH);
    expect(big).toHaveLength(1);
    expect(big[0]!.txHash).toBe("0x1");
  });

  it("scales severity with amount", () => {
    expect(severityForAmount(ETH, ETH)).toBe("MEDIUM");
    expect(severityForAmount(4n * ETH, ETH)).toBe("HIGH");
    expect(severityForAmount(20n * ETH, ETH)).toBe("CRITICAL");
  });
});

let handle: DbHandle | null = null;
let jobs: InvestigationJobRunner;
let available = false;
try {
  handle = createDb();
  await runMigrations(handle.db);
  const built = await buildApp({ db: handle });
  jobs = built.jobs;
  available = true;
} catch (err) {
  console.warn(
    `[monitor tests] skipping — Postgres unavailable (${err instanceof Error ? err.message : err})`,
  );
}

afterAll(async () => {
  await handle?.close();
});
beforeEach(async () => {
  if (available && handle) await truncateAll(handle.db);
});

describe("MonitorService (integration)", () => {
  it.skipIf(!available)(
    "auto-creates an incident + investigation on a native outflow",
    async () => {
      const db = handle!.db;
      const user = await ensureDevUser(db);
      const protocol = await createProtocol(db, {
        ownerUserId: user.id,
        name: "Monitored",
        slug: `mon-${Date.now()}`,
      });
      await createTreasury(db, {
        protocolId: protocol.id,
        address: "0x1111111111111111111111111111111111111111",
        chain: "Base", // mainnet
      });
      await updateMonitoring(db, protocol.id, { treasuryMonitoring: true });

      const balances = [10n * ETH, 4n * ETH]; // baseline, then a 6-ETH outflow
      let call = 0;
      const monitor = new MonitorService(db, jobs, {
        defaultThresholdWei: ETH,
        reader: {
          getNativeBalance: async () => balances[Math.min(call++, balances.length - 1)]!,
          getLatestBlockNumber: async () => 0n,
          getErc20Transfers: async () => [],
        },
      });

      await monitor.tick(); // establishes baseline, no alert
      let after = await listIncidents(db, { protocolId: protocol.id });
      expect(after.total).toBe(0);

      await monitor.tick(); // 6-ETH drop → alert
      after = await listIncidents(db, { protocolId: protocol.id });
      expect(after.total).toBe(1);
      expect(after.items[0]!.metadata["alert"]).toBe("native_outflow");
      expect(after.items[0]!.severity).toBe("HIGH");
    },
  );

  it.skipIf(!available)(
    "monitors a non-EVM (Solana) treasury with the chain's base-unit threshold",
    async () => {
      const db = handle!.db;
      const user = await ensureDevUser(db);
      const protocol = await createProtocol(db, {
        ownerUserId: user.id,
        name: "Solana Fund",
        slug: `sol-${Date.now()}`,
      });
      await createTreasury(db, {
        protocolId: protocol.id,
        address: "So11111111111111111111111111111111111111112",
        chain: "Solana",
      });
      await updateMonitoring(db, protocol.id, { treasuryMonitoring: true });

      const SOL = 10n ** 9n; // lamports
      const balances = [50n * SOL, 40n * SOL]; // baseline, then a 10-SOL outflow
      let call = 0;
      const monitor = new MonitorService(db, jobs, {
        reader: {
          getNativeBalance: async () => balances[Math.min(call++, balances.length - 1)]!,
          getLatestBlockNumber: async () => 0n,
          getErc20Transfers: async () => [],
        },
      });

      await monitor.tick(); // baseline
      expect((await listIncidents(db, { protocolId: protocol.id })).total).toBe(0);

      await monitor.tick(); // 10-SOL drop ≥ 1-SOL default → alert
      const after = await listIncidents(db, { protocolId: protocol.id });
      expect(after.total).toBe(1);
      expect(after.items[0]!.chain?.name).toBe("Solana");
      expect(after.items[0]!.metadata["alert"]).toBe("native_outflow");
    },
  );
});
