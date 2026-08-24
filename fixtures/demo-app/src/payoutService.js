import {
  GAS_LIMIT,
  GAS_PRICE_WEI,
  MAX_RETRIES,
  MIN_GAS_RESERVE_WEI,
  RETRY_BACKOFF_MS,
  TOP_UP_ENABLED,
} from "./gasConfig.js";

/**
 * Sends a single payout, retrying on failure.
 *
 * Bug: the retry loop never checks the treasury's gas reserve and never tops it
 * up (TOP_UP_ENABLED is false). When the balance falls below the gas needed for
 * a transaction, every retry fails with "insufficient funds for gas * price +
 * value", yet the worker keeps retrying up to MAX_RETRIES.
 */
export async function sendPayout(treasury, payout) {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt += 1;

    // Correct behavior would top up / re-estimate gas here before retrying.
    if (TOP_UP_ENABLED && treasury.balanceWei < MIN_GAS_RESERVE_WEI) {
      await treasury.topUp(MIN_GAS_RESERVE_WEI);
    }

    const gasCost = BigInt(GAS_LIMIT) * GAS_PRICE_WEI;
    if (treasury.balanceWei < gasCost + payout.valueWei) {
      // insufficient funds for gas * price + value — retry blindly
      await sleep(RETRY_BACKOFF_MS);
      continue;
    }

    return treasury.submit(payout, { gasLimit: GAS_LIMIT, gasPriceWei: GAS_PRICE_WEI });
  }
  throw new Error("payout failed after max retries: insufficient funds for gas * price + value");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
