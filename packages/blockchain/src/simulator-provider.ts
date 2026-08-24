import {
  getRecentTransactions as simRecentTx,
  getTransaction as simTx,
  getTransactionReceipt as simReceipt,
  getWalletBalance as simBalance,
  type SimTransaction,
} from "@aegis/simulator";
import type {
  BlockchainProvider,
  ChainReceipt,
  ChainTransaction,
  WalletBalance,
} from "./provider.js";

function mapTx(t: SimTransaction): ChainTransaction {
  const tx: ChainTransaction = {
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
  if (t.error !== undefined) tx.error = t.error;
  return tx;
}

/** Reads the deterministic demo environment. */
export class SimulatorProvider implements BlockchainProvider {
  readonly name = "simulator";
  readonly simulated = true;

  async getWalletBalance(address: string): Promise<WalletBalance> {
    return simBalance(address);
  }

  async getRecentTransactions(
    address: string,
    limit = 10,
  ): Promise<ChainTransaction[]> {
    return simRecentTx(address, limit).map(mapTx);
  }

  async getTransaction(hash: string): Promise<ChainTransaction | null> {
    const t = simTx(hash);
    return t ? mapTx(t) : null;
  }

  async getTransactionReceipt(hash: string): Promise<ChainReceipt | null> {
    const r = simReceipt(hash);
    if (!r) return null;
    const receipt: ChainReceipt = {
      hash: r.hash,
      blockNumber: r.blockNumber,
      status: r.status,
      gasUsed: r.gasUsed,
      effectiveGasPriceWei: r.effectiveGasPriceWei,
    };
    if (r.revertReason !== undefined) receipt.revertReason = r.revertReason;
    return receipt;
  }
}
