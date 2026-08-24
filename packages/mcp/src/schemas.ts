import { z } from "zod";

/** Output schemas for every tool. Handler results are validated against these
 * before returning, so malformed tool output is caught, not propagated. */

export const ChainTxStatusSchema = z.enum(["SUCCESS", "REVERTED", "PENDING"]);

export const ChainTransactionSchema = z.object({
  hash: z.string(),
  blockNumber: z.number().nullable(),
  from: z.string(),
  to: z.string(),
  valueWei: z.string(),
  status: ChainTxStatusSchema,
  gasUsed: z.number().nullable(),
  gasPriceWei: z.string().nullable(),
  error: z.string().optional(),
  timestamp: z.string().optional(),
});

export const ChainReceiptSchema = z.object({
  hash: z.string(),
  blockNumber: z.number(),
  status: ChainTxStatusSchema,
  gasUsed: z.number(),
  effectiveGasPriceWei: z.string(),
  revertReason: z.string().optional(),
});

export const WalletBalanceSchema = z.object({
  address: z.string(),
  balanceWei: z.string(),
  symbol: z.string(),
});

export const TreasuryBalanceSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  balanceWei: z.string(),
  requiredGasReserveWei: z.string(),
  sufficient: z.boolean(),
  shortfallWei: z.string(),
});

export const PayoutFailureSchema = z.object({
  id: z.string(),
  txHash: z.string(),
  recipient: z.string(),
  amountWei: z.string(),
  reason: z.string(),
  attempts: z.number(),
  timestamp: z.string(),
});

export const AlertSchema = z.object({
  id: z.string(),
  name: z.string(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  description: z.string(),
  active: z.boolean(),
  since: z.string(),
});

export const MetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.string(),
});

export const LogLineSchema = z.object({
  timestamp: z.string(),
  level: z.enum(["INFO", "WARN", "ERROR"]),
  service: z.string(),
  message: z.string(),
});
