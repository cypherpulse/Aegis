import type {
  SimAccount,
  SimAlert,
  SimLogLine,
  SimMetric,
  SimPayoutFailure,
  SimTransaction,
} from "./types.js";

/**
 * Fixed base time so every derived timestamp is deterministic and independent
 * of the wall clock. The demo reproduces the exact same incident every run.
 */
const BASE_TS = Date.parse("2026-08-19T12:00:00.000Z");
const minutesAgo = (n: number): string =>
  new Date(BASE_TS - n * 60_000).toISOString();

export const TREASURY_ADDRESS = "0xAe9150fF11A9c1b2C3d4E5f60718293a4B5C6d7E";
const RECIPIENT_A = "0x1111111111111111111111111111111111111111";
const RECIPIENT_B = "0x2222222222222222222222222222222222222222";
const RECIPIENT_C = "0x3333333333333333333333333333333333333333";

const GAS_PRICE_WEI = "500000000"; // 0.5 gwei
const PAYOUT_VALUE_WEI = "200000000000000"; // 0.0002 ETH
const INSUFFICIENT = "insufficient funds for gas * price + value";

export const TREASURY_ACCOUNT: SimAccount = {
  address: TREASURY_ADDRESS,
  symbol: "ETH",
  balanceWei: "420000000000000", // 0.00042 ETH — critically low
  requiredGasReserveWei: "1500000000000000", // 0.0015 ETH to clear the queue
};

export const TRANSACTIONS: SimTransaction[] = [
  {
    hash: "0xpayoutfail0000000000000000000000000000000000000000000000000000d4",
    blockNumber: 9_000_004,
    from: TREASURY_ADDRESS,
    to: RECIPIENT_C,
    valueWei: PAYOUT_VALUE_WEI,
    nonce: 104,
    gasLimit: 21_000,
    gasUsed: 0,
    gasPriceWei: GAS_PRICE_WEI,
    status: "REVERTED",
    error: INSUFFICIENT,
    timestamp: minutesAgo(2),
    kind: "PAYOUT",
  },
  {
    hash: "0xpayoutfail0000000000000000000000000000000000000000000000000000d3",
    blockNumber: 9_000_003,
    from: TREASURY_ADDRESS,
    to: RECIPIENT_B,
    valueWei: PAYOUT_VALUE_WEI,
    nonce: 103,
    gasLimit: 21_000,
    gasUsed: 0,
    gasPriceWei: GAS_PRICE_WEI,
    status: "REVERTED",
    error: INSUFFICIENT,
    timestamp: minutesAgo(6),
    kind: "PAYOUT",
  },
  {
    hash: "0xpayoutfail0000000000000000000000000000000000000000000000000000d2",
    blockNumber: 9_000_002,
    from: TREASURY_ADDRESS,
    to: RECIPIENT_A,
    valueWei: PAYOUT_VALUE_WEI,
    nonce: 102,
    gasLimit: 21_000,
    gasUsed: 0,
    gasPriceWei: GAS_PRICE_WEI,
    status: "REVERTED",
    error: INSUFFICIENT,
    timestamp: minutesAgo(11),
    kind: "PAYOUT",
  },
  {
    hash: "0xpayoutfail0000000000000000000000000000000000000000000000000000d1",
    blockNumber: 9_000_001,
    from: TREASURY_ADDRESS,
    to: RECIPIENT_C,
    valueWei: PAYOUT_VALUE_WEI,
    nonce: 101,
    gasLimit: 21_000,
    gasUsed: 0,
    gasPriceWei: GAS_PRICE_WEI,
    status: "REVERTED",
    error: INSUFFICIENT,
    timestamp: minutesAgo(17),
    kind: "PAYOUT",
  },
  {
    hash: "0xsuccesspayout00000000000000000000000000000000000000000000000a01",
    blockNumber: 8_999_800,
    from: TREASURY_ADDRESS,
    to: RECIPIENT_A,
    valueWei: PAYOUT_VALUE_WEI,
    nonce: 100,
    gasLimit: 21_000,
    gasUsed: 21_000,
    gasPriceWei: GAS_PRICE_WEI,
    status: "SUCCESS",
    timestamp: minutesAgo(240),
    kind: "PAYOUT",
  },
  {
    hash: "0xfunding0000000000000000000000000000000000000000000000000000f001",
    blockNumber: 8_999_500,
    from: "0x9999999999999999999999999999999999999999",
    to: TREASURY_ADDRESS,
    valueWei: "5000000000000000", // 0.005 ETH top-up, long ago
    nonce: 7,
    gasLimit: 21_000,
    gasUsed: 21_000,
    gasPriceWei: GAS_PRICE_WEI,
    status: "SUCCESS",
    timestamp: minutesAgo(600),
    kind: "FUNDING",
  },
];

export const PAYOUT_FAILURES: SimPayoutFailure[] = [
  {
    id: "PF-104",
    txHash: TRANSACTIONS[0]!.hash,
    recipient: RECIPIENT_C,
    amountWei: PAYOUT_VALUE_WEI,
    reason: INSUFFICIENT,
    attempts: 5,
    timestamp: minutesAgo(2),
  },
  {
    id: "PF-103",
    txHash: TRANSACTIONS[1]!.hash,
    recipient: RECIPIENT_B,
    amountWei: PAYOUT_VALUE_WEI,
    reason: INSUFFICIENT,
    attempts: 7,
    timestamp: minutesAgo(6),
  },
  {
    id: "PF-102",
    txHash: TRANSACTIONS[2]!.hash,
    recipient: RECIPIENT_A,
    amountWei: PAYOUT_VALUE_WEI,
    reason: INSUFFICIENT,
    attempts: 8,
    timestamp: minutesAgo(11),
  },
  {
    id: "PF-101",
    txHash: TRANSACTIONS[3]!.hash,
    recipient: RECIPIENT_C,
    amountWei: PAYOUT_VALUE_WEI,
    reason: INSUFFICIENT,
    attempts: 7,
    timestamp: minutesAgo(17),
  },
];

export const ALERTS: SimAlert[] = [
  {
    id: "ALT-1",
    name: "Payout failure rate elevated",
    severity: "CRITICAL",
    description:
      "Payout worker failure rate is 88% over the last 20 minutes (threshold 10%).",
    active: true,
    since: minutesAgo(17),
  },
  {
    id: "ALT-2",
    name: "Treasury native balance critically low",
    severity: "HIGH",
    description:
      "Treasury ETH balance (0.00042) is below the required gas reserve (0.0015).",
    active: true,
    since: minutesAgo(20),
  },
];

export const METRICS: SimMetric[] = [
  {
    name: "payout_success_rate",
    value: 0.12,
    unit: "ratio",
    timestamp: minutesAgo(1),
  },
  {
    name: "payout_retry_count",
    value: 27,
    unit: "count",
    timestamp: minutesAgo(1),
  },
  { name: "pending_payouts", value: 3, unit: "count", timestamp: minutesAgo(1) },
  {
    name: "treasury_balance_eth",
    value: 0.00042,
    unit: "eth",
    timestamp: minutesAgo(1),
  },
  {
    name: "avg_gas_price_gwei",
    value: 0.5,
    unit: "gwei",
    timestamp: minutesAgo(1),
  },
];

export const LOGS: SimLogLine[] = [
  {
    timestamp: minutesAgo(2),
    level: "ERROR",
    service: "payout-worker",
    message: `payout to ${RECIPIENT_C} reverted: ${INSUFFICIENT} (attempt 5)`,
  },
  {
    timestamp: minutesAgo(3),
    level: "WARN",
    service: "payout-worker",
    message: "retry backoff engaged; 3 payouts pending in queue",
  },
  {
    timestamp: minutesAgo(6),
    level: "ERROR",
    service: "payout-worker",
    message: `payout to ${RECIPIENT_B} reverted: ${INSUFFICIENT} (attempt 7)`,
  },
  {
    timestamp: minutesAgo(11),
    level: "ERROR",
    service: "payout-worker",
    message: `payout to ${RECIPIENT_A} reverted: ${INSUFFICIENT} (attempt 8)`,
  },
  {
    timestamp: minutesAgo(15),
    level: "WARN",
    service: "treasury-monitor",
    message: "treasury balance below gas reserve threshold",
  },
];
