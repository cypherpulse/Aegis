import type { Evidence, InvestigationFinding } from "@aegis/shared";
import {
  evidence,
  output,
  wasBlocked,
  weiToEth,
  successFinding,
  type PayoutFailureOut,
  type TreasuryBalanceOut,
} from "../analysis.js";
import type { InvestigationContext } from "../context.js";
import { runInvestigator } from "../run-investigator.js";
import { TREASURY_SPEC } from "../specs.js";

export function runTreasuryInvestigator(
  ctx: InvestigationContext,
): Promise<InvestigationFinding> {
  return runInvestigator({
    ctx,
    spec: TREASURY_SPEC,
    taskPrompt:
      "Investigate whether treasury state explains the incident. Check the " +
      "treasury balance against the required gas reserve and recent payout " +
      "failures.",
    plan: [
      {
        // Sensitive: triggers the human-in-the-loop approval gate first.
        tool: "getTreasuryBalance",
        input: {},
        reason: "read privileged treasury balance and reserve state",
      },
      {
        tool: "getPayoutFailures",
        input: {},
        reason: "enumerate recent payout failures",
      },
    ],
    analyze: (results) => {
      const tb = output<TreasuryBalanceOut>(results, "getTreasuryBalance");
      const balanceBlocked = wasBlocked(results, "getTreasuryBalance");
      const failures =
        output<{ failures: PayoutFailureOut[] }>(results, "getPayoutFailures")
          ?.failures ?? [];

      const ev: Evidence[] = [];
      if (tb) {
        ev.push(
          evidence(
            "treasury",
            "balance",
            tb.address,
            `treasury balance ${weiToEth(tb.balanceWei)} ETH is ` +
              `${tb.sufficient ? "at or above" : "below"} the required gas ` +
              `reserve ${weiToEth(tb.requiredGasReserveWei)} ETH ` +
              `(shortfall ${weiToEth(tb.shortfallWei)} ETH)`,
          ),
        );
      }
      if (balanceBlocked) {
        ev.push(
          evidence(
            "approval-gate",
            "blocked",
            "getTreasuryBalance",
            "treasury balance read was blocked pending human approval",
          ),
        );
      }
      if (failures.length > 0) {
        const totalAttempts = failures.reduce((n, f) => n + f.attempts, 0);
        ev.push(
          evidence(
            "treasury",
            "payout-failures",
            failures[0]?.txHash ?? "",
            `${failures.length} payout failures across ${totalAttempts} ` +
              `attempts; representative reason: ${failures[0]?.reason ?? "n/a"}`,
          ),
        );
      }

      const insufficient = tb ? !tb.sufficient : false;
      let confidence: number;
      if (tb && insufficient) {
        confidence = 0.9 + 0.015 * Math.min(failures.length, 4);
      } else if (balanceBlocked) {
        confidence = 0.6;
      } else {
        confidence = 0.5;
      }

      const severity = insufficient ? "CRITICAL" : "HIGH";

      return successFinding({
        investigator: "TREASURY",
        summary: insufficient
          ? `Treasury balance is below the required gas reserve; ${failures.length} ` +
            `payouts are failing as a result.`
          : balanceBlocked
            ? `Treasury balance read blocked by approval; ${failures.length} payout ` +
              `failures observed.`
            : `Treasury balance appears sufficient; ${failures.length} payout ` +
              `failures observed.`,
        evidence: ev,
        confidence,
        severity,
        metadata: {
          balanceBlocked,
          sufficient: tb?.sufficient ?? null,
          failureCount: failures.length,
        },
      });
    },
  });
}
