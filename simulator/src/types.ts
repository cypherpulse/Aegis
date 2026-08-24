/**
 * Types for the deterministic demo environment. All native-currency amounts
 * are decimal wei strings so they stay JSON-safe (no bigint serialization).
 */

export type TxStatus = "SUCCESS" | "REVERTED";

export interface SimTransaction {
  hash: string;
  blockNumber: number;
  from: string;
  to: string;
  /** Native value transferred, in wei (decimal string). */
  valueWei: string;
  nonce: number;
  gasLimit: number;
  gasUsed: number;
  /** Effective gas price in wei (decimal string). */
  gasPriceWei: string;
  status: TxStatus;
  /** Revert / failure reason when status is REVERTED. */
  error?: string;
  timestamp: string;
  kind: "PAYOUT" | "FUNDING" | "OTHER";
}

export interface SimReceipt {
  hash: string;
  blockNumber: number;
  status: TxStatus;
  gasUsed: number;
  effectiveGasPriceWei: string;
  revertReason?: string;
}

export interface SimAccount {
  address: string;
  symbol: string;
  balanceWei: string;
  /** Native reserve the payout worker needs to clear the pending queue. */
  requiredGasReserveWei: string;
}

export interface SimPayoutFailure {
  id: string;
  txHash: string;
  recipient: string;
  amountWei: string;
  reason: string;
  attempts: number;
  timestamp: string;
}

export interface SimAlert {
  id: string;
  name: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  active: boolean;
  since: string;
}

export interface SimMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface SimLogLine {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  service: string;
  message: string;
}
