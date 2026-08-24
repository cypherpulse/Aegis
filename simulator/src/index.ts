import type { Incident } from "@aegis/shared";
import {
  ALERTS,
  LOGS,
  METRICS,
  PAYOUT_FAILURES,
  TRANSACTIONS,
  TREASURY_ACCOUNT,
  TREASURY_ADDRESS,
} from "./data.js";
import type {
  SimAlert,
  SimLogLine,
  SimMetric,
  SimPayoutFailure,
  SimReceipt,
  SimTransaction,
} from "./types.js";

export * from "./types.js";
export { TREASURY_ADDRESS } from "./data.js";

/** Balance of any account known to the simulator (defaults to zero). */
export function getWalletBalance(address: string): {
  address: string;
  balanceWei: string;
  symbol: string;
} {
  if (address.toLowerCase() === TREASURY_ADDRESS.toLowerCase()) {
    return {
      address: TREASURY_ACCOUNT.address,
      balanceWei: TREASURY_ACCOUNT.balanceWei,
      symbol: TREASURY_ACCOUNT.symbol,
    };
  }
  return { address, balanceWei: "0", symbol: "ETH" };
}

/** Recent transactions, newest first, optionally filtered by involved address. */
export function getRecentTransactions(
  address?: string,
  limit = 10,
): SimTransaction[] {
  const lower = address?.toLowerCase();
  const filtered = lower
    ? TRANSACTIONS.filter(
        (t) => t.from.toLowerCase() === lower || t.to.toLowerCase() === lower,
      )
    : TRANSACTIONS;
  return filtered.slice(0, limit);
}

export function getTransaction(hash: string): SimTransaction | null {
  return TRANSACTIONS.find((t) => t.hash === hash) ?? null;
}

export function getTransactionReceipt(hash: string): SimReceipt | null {
  const tx = getTransaction(hash);
  if (!tx) return null;
  const receipt: SimReceipt = {
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    status: tx.status,
    gasUsed: tx.gasUsed,
    effectiveGasPriceWei: tx.gasPriceWei,
  };
  if (tx.error !== undefined) receipt.revertReason = tx.error;
  return receipt;
}

export function getTreasuryAccount() {
  return { ...TREASURY_ACCOUNT };
}

export function getRecentTreasuryTransactions(limit = 10): SimTransaction[] {
  return getRecentTransactions(TREASURY_ADDRESS, limit);
}

export function getPayoutFailures(): SimPayoutFailure[] {
  return PAYOUT_FAILURES.slice();
}

export function getActiveAlerts(): SimAlert[] {
  return ALERTS.filter((a) => a.active);
}

export function getServiceMetrics(): SimMetric[] {
  return METRICS.slice();
}

export function getRecentLogs(limit = 20): SimLogLine[] {
  return LOGS.slice(0, limit);
}

/**
 * The deterministic hero incident. Always reproducible — this is what the demo
 * "creates/loads" before starting the investigation.
 */
export function getHeroIncident(): Incident {
  return {
    id: "INC-001",
    type: "TREASURY_GAS_DEPLETION",
    severity: "CRITICAL",
    title: "Treasury gas depletion halting payouts",
    description:
      "Payout transactions are failing on Base Sepolia. The treasury native " +
      "balance is critically low and the application payout worker is retrying. " +
      "Transaction failures indicate insufficient gas.",
    affectedProtocol: "Aegis Demo Protocol",
    chain: { name: "Base Sepolia", chainId: 84532 },
    detectedAt: "2026-08-19T12:00:00.000Z",
    status: "DETECTED",
    metadata: {
      treasuryAddress: TREASURY_ADDRESS,
      simulated: true,
    },
  };
}
