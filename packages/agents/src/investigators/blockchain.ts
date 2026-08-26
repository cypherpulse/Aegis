import { makeEvent, type Evidence, type InvestigationFinding } from "@aegis/shared";
import { callTool } from "@aegis/mcp";
import {
  evidence,
  noDataFinding,
  output,
  weiToEth,
  successFinding,
  type BalanceOut,
  type ChainTxOut,
  type ReceiptOut,
} from "../analysis.js";
import type { InvestigationContext } from "../context.js";
import { runInvestigator } from "../run-investigator.js";
import { BLOCKCHAIN_SPEC } from "../specs.js";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function runBlockchainInvestigator(
  ctx: InvestigationContext,
): Promise<InvestigationFinding> {
  const treasury = String(
    ctx.incident.metadata["treasuryAddress"] ??
      ctx.incident.metadata["contractAddress"] ??
      ctx.incident.metadata["address"] ??
      "",
  );
  const providerName = ctx.toolCtx.provider.name;

  // The on-chain tools read EVM state. When the incident carries no EVM address
  // (e.g. a non-EVM chain like Solana/Stacks, or an alert with no address), skip
  // the on-chain plan and return a graceful low-confidence finding rather than
  // failing the whole investigation on invalid tool input.
  if (!EVM_ADDRESS.test(treasury)) {
    return Promise.resolve(
      noDataFinding(
        "BLOCKCHAIN",
        providerName,
        `No EVM address available for on-chain analysis on ${ctx.incident.chain.name}.`,
      ),
    );
  }

  return runInvestigator({
    ctx,
    spec: BLOCKCHAIN_SPEC,
    taskPrompt:
      `Investigate onchain state for treasury ${treasury} on ` +
      `${ctx.incident.chain.name}. Inspect the balance and recent transaction ` +
      `failures, and explain the failure pattern.`,
    plan: [
      {
        tool: "getWalletBalance",
        input: { address: treasury },
        reason: "check treasury native balance onchain",
      },
      {
        tool: "getRecentTransactions",
        input: { address: treasury, limit: 6 },
        reason: "inspect recent transactions for failures",
      },
    ],
    analyze: async (results, c) => {
      const bal = output<BalanceOut>(results, "getWalletBalance");
      const txs =
        output<{ transactions: ChainTxOut[] }>(results, "getRecentTransactions")
          ?.transactions ?? [];
      const reverted = txs.filter((t) => t.status === "REVERTED");
      const insufficient = reverted.filter((t) =>
        (t.error ?? "").includes("insufficient"),
      );

      // Follow up on the most recent failure with a receipt read.
      let revertReason: string | undefined;
      const first = reverted[0];
      if (first) {
        c.emit(
          makeEvent({
            incidentId: c.incident.id,
            type: "investigator.tool_called",
            actor: BLOCKCHAIN_SPEC.actor,
            payload: { tool: "getTransactionReceipt", input: { hash: first.hash } },
          }),
        );
        const { output: recv, durationMs } = await callTool(
          c.registry.get("getTransactionReceipt"),
          { hash: first.hash },
          c.toolCtx,
        );
        c.emit(
          makeEvent({
            incidentId: c.incident.id,
            type: "investigator.tool_completed",
            actor: BLOCKCHAIN_SPEC.actor,
            payload: { tool: "getTransactionReceipt", durationMs },
          }),
        );
        revertReason =
          (recv as { receipt: ReceiptOut | null }).receipt?.revertReason ??
          first.error;
      }

      const ev: Evidence[] = [];
      if (bal) {
        ev.push(
          evidence(
            providerName,
            "balance",
            bal.address,
            `treasury native balance is ${weiToEth(bal.balanceWei)} ${bal.symbol}`,
          ),
        );
      }
      if (txs.length > 0) {
        ev.push(
          evidence(
            providerName,
            "transactions",
            treasury,
            `${reverted.length} of ${txs.length} recent transactions reverted`,
          ),
        );
      }
      if (revertReason) {
        ev.push(
          evidence(
            providerName,
            "revert-reason",
            first?.hash ?? "",
            `failing payout revert reason: ${revertReason}`,
          ),
        );
      }

      const confidence = 0.6 + 0.08 * insufficient.length;
      const severity =
        insufficient.length >= 3
          ? "CRITICAL"
          : reverted.length > 0
            ? "HIGH"
            : "MEDIUM";

      return successFinding({
        investigator: "BLOCKCHAIN",
        summary:
          reverted.length > 0
            ? `${reverted.length} recent payout transactions reverted, ` +
              `${insufficient.length} due to insufficient gas funds.`
            : "No reverted transactions observed for the treasury.",
        evidence: ev,
        confidence,
        severity,
        metadata: {
          provider: providerName,
          simulated: c.toolCtx.provider.simulated,
          revertedCount: reverted.length,
          insufficientCount: insufficient.length,
        },
      });
    },
  });
}
