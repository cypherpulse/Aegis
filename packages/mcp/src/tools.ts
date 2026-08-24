import {
  getActiveAlerts,
  getPayoutFailures,
  getRecentLogs,
  getRecentTreasuryTransactions,
  getServiceMetrics,
  getTreasuryAccount,
} from "@aegis/simulator";
import { z } from "zod";
import {
  AlertSchema,
  ChainReceiptSchema,
  ChainTransactionSchema,
  LogLineSchema,
  MetricSchema,
  PayoutFailureSchema,
  TreasuryBalanceSchema,
  WalletBalanceSchema,
} from "./schemas.js";
import { codeTools } from "./code-tools.js";
import { defineTool, type AnyTool } from "./tool.js";

const addressInput = z.object({
  address: z.string().min(1).describe("The account address to inspect"),
});
const hashInput = z.object({
  hash: z.string().min(1).describe("The transaction hash"),
});
const limitInput = z.object({
  limit: z.number().int().positive().max(50).optional(),
});
const emptyInput = z.object({});

/** Blockchain Investigator tools — read onchain state via the provider. */
export const blockchainTools: AnyTool[] = [
  defineTool({
    name: "getWalletBalance",
    description: "Get the native balance of an address on the active chain.",
    inputSchema: addressInput,
    outputSchema: WalletBalanceSchema,
    handler: async (input, ctx) => ctx.provider.getWalletBalance(input.address),
  }),
  defineTool({
    name: "getRecentTransactions",
    description:
      "List recent transactions involving an address, newest first.",
    inputSchema: addressInput.extend(limitInput.shape),
    outputSchema: z.object({ transactions: z.array(ChainTransactionSchema) }),
    handler: async (input, ctx) => ({
      transactions: await ctx.provider.getRecentTransactions(
        input.address,
        input.limit,
      ),
    }),
  }),
  defineTool({
    name: "getTransaction",
    description: "Fetch a single transaction by hash.",
    inputSchema: hashInput,
    outputSchema: z.object({ transaction: ChainTransactionSchema.nullable() }),
    handler: async (input, ctx) => ({
      transaction: await ctx.provider.getTransaction(input.hash),
    }),
  }),
  defineTool({
    name: "getTransactionReceipt",
    description: "Fetch a transaction receipt (status, gas, revert reason).",
    inputSchema: hashInput,
    outputSchema: z.object({ receipt: ChainReceiptSchema.nullable() }),
    handler: async (input, ctx) => ({
      receipt: await ctx.provider.getTransactionReceipt(input.hash),
    }),
  }),
];

/** Treasury Investigator tools — read-only treasury state. */
export const treasuryTools: AnyTool[] = [
  defineTool({
    name: "getTreasuryBalance",
    // Reading privileged treasury state is gated: it emits a real approval
    // request before running (auto-approved in Phase 1 since it is read-only).
    description:
      "Get the treasury balance and whether it covers the required gas reserve.",
    sensitive: true,
    inputSchema: emptyInput,
    outputSchema: TreasuryBalanceSchema,
    handler: async () => {
      const acct = getTreasuryAccount();
      const balance = BigInt(acct.balanceWei);
      const required = BigInt(acct.requiredGasReserveWei);
      const shortfall = required > balance ? required - balance : 0n;
      return {
        address: acct.address,
        symbol: acct.symbol,
        balanceWei: acct.balanceWei,
        requiredGasReserveWei: acct.requiredGasReserveWei,
        sufficient: balance >= required,
        shortfallWei: shortfall.toString(),
      };
    },
  }),
  defineTool({
    name: "getRecentTreasuryTransactions",
    description: "List recent transactions from the treasury account.",
    inputSchema: limitInput,
    outputSchema: z.object({ transactions: z.array(ChainTransactionSchema) }),
    handler: async (input) => ({
      transactions: getRecentTreasuryTransactions(input.limit).map((t) => {
        const base = {
          hash: t.hash,
          blockNumber: t.blockNumber,
          from: t.from,
          to: t.to,
          valueWei: t.valueWei,
          status: t.status,
          gasUsed: t.gasUsed,
          gasPriceWei: t.gasPriceWei,
          timestamp: t.timestamp,
        };
        return t.error !== undefined ? { ...base, error: t.error } : base;
      }),
    }),
  }),
  defineTool({
    name: "getPayoutFailures",
    description: "List recent payout failures with reasons and attempt counts.",
    inputSchema: emptyInput,
    outputSchema: z.object({ failures: z.array(PayoutFailureSchema) }),
    handler: async () => ({ failures: getPayoutFailures() }),
  }),
];

/** Application Investigator tools — read-only telemetry. */
export const applicationTools: AnyTool[] = [
  defineTool({
    name: "getActiveAlerts",
    description: "List active application/protocol alerts.",
    inputSchema: emptyInput,
    outputSchema: z.object({ alerts: z.array(AlertSchema) }),
    handler: async () => ({ alerts: getActiveAlerts() }),
  }),
  defineTool({
    name: "getServiceMetrics",
    description: "Read current service metrics (rates, counts).",
    inputSchema: emptyInput,
    outputSchema: z.object({ metrics: z.array(MetricSchema) }),
    handler: async () => ({ metrics: getServiceMetrics() }),
  }),
  defineTool({
    name: "getRecentLogs",
    description: "Read recent application logs, newest first.",
    inputSchema: limitInput,
    outputSchema: z.object({ logs: z.array(LogLineSchema) }),
    handler: async (input) => ({ logs: getRecentLogs(input.limit) }),
  }),
];

export const allTools: AnyTool[] = [
  ...blockchainTools,
  ...treasuryTools,
  ...applicationTools,
  ...codeTools,
];
