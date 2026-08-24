import { describe, expect, it } from "vitest";
import { TREASURY_ADDRESS } from "@aegis/simulator";
import {
  createBlockchainProvider,
  SimulatorProvider,
  ViemProvider,
} from "../src/index.js";

describe("blockchain provider selection", () => {
  it("defaults to the simulator when no RPC URL is set", () => {
    const p = createBlockchainProvider({ rpcUrl: undefined });
    expect(p).toBeInstanceOf(SimulatorProvider);
    expect(p.simulated).toBe(true);
  });

  it("uses viem when an RPC URL is provided", () => {
    const p = createBlockchainProvider({ rpcUrl: "https://sepolia.example" });
    expect(p).toBeInstanceOf(ViemProvider);
    expect(p.simulated).toBe(false);
  });

  it("forceSimulator wins even with an RPC URL", () => {
    const p = createBlockchainProvider({
      rpcUrl: "https://sepolia.example",
      forceSimulator: true,
    });
    expect(p).toBeInstanceOf(SimulatorProvider);
  });
});

describe("SimulatorProvider reads", () => {
  const p = new SimulatorProvider();

  it("returns the low treasury balance", async () => {
    const bal = await p.getWalletBalance(TREASURY_ADDRESS);
    expect(BigInt(bal.balanceWei)).toBeGreaterThan(0n);
    expect(bal.symbol).toBe("ETH");
  });

  it("returns reverted payout transactions with revert reasons", async () => {
    const txs = await p.getRecentTransactions(TREASURY_ADDRESS);
    const failed = txs.filter((t) => t.status === "REVERTED");
    expect(failed.length).toBeGreaterThanOrEqual(4);
    const receipt = await p.getTransactionReceipt(failed[0]!.hash);
    expect(receipt?.revertReason).toContain("insufficient funds");
  });

  it("returns null for an unknown hash", async () => {
    expect(await p.getTransaction("0xnope")).toBeNull();
  });
});
