import { SimulatorProvider } from "./simulator-provider.js";
import { ViemProvider } from "./viem-provider.js";
import type { BlockchainProvider } from "./provider.js";

export * from "./provider.js";
export { SimulatorProvider } from "./simulator-provider.js";
export { ViemProvider } from "./viem-provider.js";
export { isValidAddress, verifyWalletSignature } from "./wallet.js";
export {
  CHAINS,
  listChains,
  resolveChain,
  isValidAddressForChain,
  explorerAddressUrl,
  explorerTxUrl,
  rpcUrlFor,
  getChainClient,
  getNativeBalance,
  getLatestBlockNumber,
  getErc20Transfers,
  getContractActivity,
  type ContractActivity,
  type ChainInfo,
  type ChainFamily,
  type Erc20Transfer,
} from "./chains.js";

export interface ProviderOptions {
  /** Explicit RPC URL. Falls back to BASE_SEPOLIA_RPC_URL when omitted. */
  rpcUrl?: string | undefined;
  /** Force the simulator even if an RPC URL is present (used by the demo). */
  forceSimulator?: boolean;
}

/**
 * Select a blockchain provider. Real Base Sepolia when an RPC URL is available,
 * otherwise the deterministic simulator. The simulator is always the safe,
 * reproducible default.
 */
export function createBlockchainProvider(
  opts: ProviderOptions = {},
): BlockchainProvider {
  const rpcUrl = opts.rpcUrl ?? process.env.BASE_SEPOLIA_RPC_URL;
  if (!opts.forceSimulator && rpcUrl && rpcUrl.trim() !== "") {
    return new ViemProvider(rpcUrl);
  }
  return new SimulatorProvider();
}
