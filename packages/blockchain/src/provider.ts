/**
 * Provider abstraction so the Blockchain Investigator can read from either the
 * deterministic simulator (default) or real Base Sepolia via viem — without any
 * change to the investigator or tools (spec §16).
 */

export type ChainTxStatus = "SUCCESS" | "REVERTED" | "PENDING";

export interface WalletBalance {
  address: string;
  balanceWei: string;
  symbol: string;
}

export interface ChainTransaction {
  hash: string;
  blockNumber: number | null;
  from: string;
  to: string;
  valueWei: string;
  status: ChainTxStatus;
  gasUsed: number | null;
  gasPriceWei: string | null;
  error?: string;
  timestamp?: string;
}

export interface ChainReceipt {
  hash: string;
  blockNumber: number;
  status: ChainTxStatus;
  gasUsed: number;
  effectiveGasPriceWei: string;
  revertReason?: string;
}

export interface BlockchainProvider {
  readonly name: string;
  /** True when the data is deterministic simulated data, not a live chain. */
  readonly simulated: boolean;
  getWalletBalance(address: string): Promise<WalletBalance>;
  getRecentTransactions(
    address: string,
    limit?: number,
  ): Promise<ChainTransaction[]>;
  getTransaction(hash: string): Promise<ChainTransaction | null>;
  getTransactionReceipt(hash: string): Promise<ChainReceipt | null>;
}
