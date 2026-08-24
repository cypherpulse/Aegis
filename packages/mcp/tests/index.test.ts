import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SimulatorProvider } from "@aegis/blockchain";
import { ValidationError, ToolError } from "@aegis/shared";
import { TREASURY_ADDRESS } from "@aegis/simulator";
import {
  callTool,
  createToolRegistry,
  type ToolContext,
} from "../src/index.js";

const FIXTURE_ROOT = fileURLToPath(
  new URL("../../../fixtures/demo-app", import.meta.url),
);
const ctx: ToolContext = {
  provider: new SimulatorProvider(),
  codeRoot: FIXTURE_ROOT,
};
const registry = createToolRegistry();

describe("tool registry", () => {
  it("registers all read-only tools (10 data + 4 code)", () => {
    expect(registry.list()).toHaveLength(14);
    expect(registry.list().every((t) => t.readOnly)).toBe(true);
  });

  it("flags exactly one sensitive tool for the approval gate", () => {
    const sensitive = registry.list().filter((t) => t.sensitive);
    expect(sensitive.map((t) => t.name)).toEqual(["getTreasuryBalance"]);
  });

  it("throws on an unknown tool", () => {
    expect(() => registry.get("nope")).toThrow(ToolError);
  });
});

describe("tool input validation", () => {
  it("rejects missing required input", async () => {
    const tool = registry.get("getWalletBalance");
    await expect(callTool(tool, {}, ctx)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects a limit above the max", async () => {
    const tool = registry.get("getRecentTransactions");
    await expect(
      callTool(tool, { address: TREASURY_ADDRESS, limit: 999 }, ctx),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("tool output conformance", () => {
  it("getTreasuryBalance reports an insufficient balance", async () => {
    const tool = registry.get("getTreasuryBalance");
    const { output } = await callTool(tool, {}, ctx);
    const o = output as {
      sufficient: boolean;
      shortfallWei: string;
    };
    expect(o.sufficient).toBe(false);
    expect(BigInt(o.shortfallWei)).toBeGreaterThan(0n);
  });

  it("getRecentTransactions returns schema-valid reverted txs", async () => {
    const tool = registry.get("getRecentTransactions");
    const { output } = await callTool(
      tool,
      { address: TREASURY_ADDRESS },
      ctx,
    );
    const o = output as { transactions: Array<{ status: string }> };
    expect(o.transactions.some((t) => t.status === "REVERTED")).toBe(true);
  });

  it("searchCode finds the gas/top-up bug in the fixture", async () => {
    const tool = registry.get("searchCode");
    const { output } = await callTool(tool, { query: "TOP_UP_ENABLED" }, ctx);
    const o = output as { matches: Array<{ file: string }> };
    expect(o.matches.length).toBeGreaterThan(0);
    expect(o.matches.some((m) => m.file.includes("gasConfig"))).toBe(true);
  });

  it("readFile rejects path traversal outside the code root", async () => {
    const tool = registry.get("readFile");
    await expect(
      callTool(tool, { path: "../../../package.json" }, ctx),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("inspectRecentChanges surfaces the suspicious latest entry", async () => {
    const tool = registry.get("inspectRecentChanges");
    const { output } = await callTool(tool, {}, ctx);
    const o = output as { latestEntry: string | null };
    expect(o.latestEntry).toContain("top-up");
  });

  it("wraps handler failures as ToolError", async () => {
    const tool = registry.get("getTransactionReceipt");
    const failingCtx: ToolContext = {
      provider: Object.assign(new SimulatorProvider(), {
        getTransactionReceipt: async () => {
          throw new Error("rpc down");
        },
      }),
    };
    await expect(
      callTool(tool, { hash: "0xabc" }, failingCtx),
    ).rejects.toBeInstanceOf(ToolError);
  });
});
