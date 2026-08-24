import { createPublicClient, http, type Hash } from "viem";
import { baseSepolia } from "viem/chains";

function makeClient(rpcUrl: string) {
  return createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
}
type BaseSepoliaClient = ReturnType<typeof makeClient>;
import type {
  BlockchainProvider,
  ChainReceipt,
  ChainTransaction,
  WalletBalance,
} from "./provider.js";

/**
 * Read-only Base Sepolia provider. Uses a public RPC endpoint; never holds a
 * private key or signs anything (spec §16, §22).
 *
 * Note: enumerating recent transactions for an address is not available over a
 * plain JSON-RPC endpoint without an indexer, so getRecentTransactions returns
 * an empty list here. The simulator remains the deterministic source for the
 * demo; per-hash reads below are fully live.
 */
export class ViemProvider implements BlockchainProvider {
  readonly name = "base-sepolia";
  readonly simulated = false;
  private readonly client: BaseSepoliaClient;

  constructor(rpcUrl: string) {
    this.client = makeClient(rpcUrl);
  }

  async getWalletBalance(address: string): Promise<WalletBalance> {
    const balance = await this.client.getBalance({
      address: address as `0x${string}`,
    });
    return { address, balanceWei: balance.toString(), symbol: "ETH" };
  }

  async getRecentTransactions(): Promise<ChainTransaction[]> {
    return [];
  }

  async getTransaction(hash: string): Promise<ChainTransaction | null> {
    try {
      const tx = await this.client.getTransaction({ hash: hash as Hash });
      let status: ChainTransaction["status"] =
        tx.blockNumber === null ? "PENDING" : "SUCCESS";
      let gasUsed: number | null = null;
      if (tx.blockNumber !== null) {
        const receipt = await this.client
          .getTransactionReceipt({ hash: hash as Hash })
          .catch(() => null);
        if (receipt) {
          status = receipt.status === "success" ? "SUCCESS" : "REVERTED";
          gasUsed = Number(receipt.gasUsed);
        }
      }
      const gasPrice = (tx as { gasPrice?: bigint }).gasPrice;
      return {
        hash: tx.hash,
        blockNumber: tx.blockNumber === null ? null : Number(tx.blockNumber),
        from: tx.from,
        to: tx.to ?? "",
        valueWei: tx.value.toString(),
        status,
        gasUsed,
        gasPriceWei: gasPrice != null ? gasPrice.toString() : null,
      };
    } catch {
      return null;
    }
  }

  async getTransactionReceipt(hash: string): Promise<ChainReceipt | null> {
    try {
      const r = await this.client.getTransactionReceipt({
        hash: hash as Hash,
      });
      return {
        hash: r.transactionHash,
        blockNumber: Number(r.blockNumber),
        status: r.status === "success" ? "SUCCESS" : "REVERTED",
        gasUsed: Number(r.gasUsed),
        effectiveGasPriceWei: r.effectiveGasPrice.toString(),
      };
    } catch {
      return null;
    }
  }
}
