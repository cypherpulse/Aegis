// Gas + retry configuration for the payout worker.
//
// NOTE: values are intentionally static for the demo. The combination below is
// the source of the incident: automatic treasury top-up was disabled while the
// worker keeps retrying failed payouts, so the treasury drains and never
// refills.

export const GAS_LIMIT = 21000; // hardcoded; never re-estimated
export const GAS_PRICE_WEI = 500000000n; // 0.5 gwei, static

// Bug: retries are high AND top-up is disabled -> the worker hammers a treasury
// that can never recover its gas reserve.
export const MAX_RETRIES = 50;
export const RETRY_BACKOFF_MS = 2000;

// Bug: this was switched off in the last release "to reduce costs".
export const TOP_UP_ENABLED = false;

// The reserve the worker is supposed to maintain but no longer does.
export const MIN_GAS_RESERVE_WEI = 1500000000000000n; // 0.0015 ETH
