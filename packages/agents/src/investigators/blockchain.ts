import { makeEvent, type Evidence, type InvestigationFinding } from "@aegis/shared";
import { callTool } from "@aegis/mcp";
import type { ContractActivity } from "@aegis/blockchain";
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

/** Build a finding from REAL on-chain activity attached to the incident. */
function realOnchainFinding(a: ContractActivity): InvestigationFinding {
  const ev: Evidence[] = [
    evidence("onchain", "identity", a.address, `${a.isContract ? "deployed contract" : "account"} on ${a.chain}`),
    evidence("onchain", "balance", a.address, `native balance ${a.nativeBalanceWei} base units (${a.nativeSymbol})`),
  ];
  const txCount = a.txTotal ?? a.recentTransferCount;
  ev.push(
    evidence(
      "onchain",
      "activity",
      a.address,
      `${txCount} recent transactions/transfers${a.failedTxCount ? `, ${a.failedTxCount} failed` : ""}`,
    ),
  );
  for (const t of (a.stacksTransactions ?? []).slice(0, 3)) {
    ev.push(
      evidence("onchain", "transaction", t.txId, `${t.type} by ${t.sender} — ${t.status} (fee ${t.feeMicroStx} µSTX)`),
    );
  }
  for (const t of a.recentTransfers.slice(0, 3)) {
    ev.push(evidence("onchain", "transfer", t.txHash, `${t.from} → ${t.to}, value ${t.value}`));
  }
  const failing = (a.failedTxCount ?? 0) > 0;
  return successFinding({
    investigator: "BLOCKCHAIN",
    summary:
      `Real on-chain read of ${a.address} on ${a.chain}: ${a.isContract ? "contract" : "account"}, ` +
      `${txCount} recent tx/transfers${failing ? `, ${a.failedTxCount} FAILED` : ""}.` +
      (a.note ? ` (${a.note})` : ""),
    evidence: ev,
    confidence: failing ? 0.7 : 0.55,
    severity: failing ? "HIGH" : "MEDIUM",
    metadata: {
      source: "onchain",
      real: true,
      chain: a.chain,
      isContract: a.isContract,
      txTotal: a.txTotal ?? null,
      failedTxCount: a.failedTxCount ?? 0,
      ...(a.explorerUrl ? { explorerUrl: a.explorerUrl } : {}),
    },
  });
}

export function runBlockchainInvestigator(
  ctx: InvestigationContext,
): Promise<InvestigationFinding> {
  // Prefer REAL on-chain activity when the incident carries it (contract review).
  const activity = ctx.incident.metadata["contractActivity"] as ContractActivity | undefined;
  if (activity && typeof activity === "object" && activity.address) {
    return Promise.resolve(realOnchainFinding(activity));
  }

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
