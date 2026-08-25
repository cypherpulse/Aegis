import { isAddress, verifyMessage } from "viem";

/** True when `address` is a valid EVM address. */
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Verify that `signature` over `message` was produced by `address`
 * (EIP-191 personal_sign). Read-only; no keys involved.
 */
export async function verifyWalletSignature(params: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  if (!isAddress(params.address)) return false;
  try {
    return await verifyMessage({
      address: params.address as `0x${string}`,
      message: params.message,
      signature: params.signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}
