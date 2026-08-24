import { describe, expect, it } from "vitest";
import {
  getActiveAlerts,
  getHeroIncident,
  getPayoutFailures,
  getRecentTreasuryTransactions,
  getTransaction,
  getTransactionReceipt,
  getTreasuryAccount,
  getWalletBalance,
  TREASURY_ADDRESS,
} from "../src/index.js";

describe("simulator (deterministic hero incident)", () => {
  it("produces the same incident every call", () => {
    expect(getHeroIncident()).toEqual(getHeroIncident());
  });

  it("treasury balance is below the required gas reserve", () => {
    const acct = getTreasuryAccount();
    expect(BigInt(acct.balanceWei)).toBeLessThan(
      BigInt(acct.requiredGasReserveWei),
    );
  });

  it("reports the treasury balance via getWalletBalance", () => {
    const bal = getWalletBalance(TREASURY_ADDRESS);
    expect(bal.balanceWei).toBe(getTreasuryAccount().balanceWei);
    expect(bal.symbol).toBe("ETH");
  });

  it("recent treasury txs contain reverted payout failures", () => {
    const txs = getRecentTreasuryTransactions();
    const reverted = txs.filter((t) => t.status === "REVERTED");
    expect(reverted.length).toBeGreaterThanOrEqual(4);
    expect(reverted[0]!.kind).toBe("PAYOUT");
  });

  it("receipts carry the revert reason for failed txs", () => {
    const txs = getRecentTreasuryTransactions();
    const failed = txs.find((t) => t.status === "REVERTED")!;
    const receipt = getTransactionReceipt(failed.hash);
    expect(receipt?.status).toBe("REVERTED");
    expect(receipt?.revertReason).toContain("insufficient funds");
  });

  it("exposes an active critical payout alert", () => {
    const alerts = getActiveAlerts();
    expect(alerts.some((a) => a.severity === "CRITICAL")).toBe(true);
  });

  it("payout failures reference real transactions", () => {
    for (const pf of getPayoutFailures()) {
      expect(getTransaction(pf.txHash)).not.toBeNull();
    }
  });

  it("returns null for unknown transactions", () => {
    expect(getTransaction("0xdoesnotexist")).toBeNull();
  });
});
