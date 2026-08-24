import type { Evidence, InvestigationFinding, Severity } from "@aegis/shared";
import {
  evidence,
  output,
  successFinding,
  type AlertOut,
  type LogOut,
  type MetricOut,
} from "../analysis.js";
import type { InvestigationContext } from "../context.js";
import { runInvestigator } from "../run-investigator.js";
import { APPLICATION_SPEC } from "../specs.js";

export function runApplicationInvestigator(
  ctx: InvestigationContext,
): Promise<InvestigationFinding> {
  return runInvestigator({
    ctx,
    spec: APPLICATION_SPEC,
    taskPrompt:
      "Investigate whether application behavior contributes to the incident. " +
      "Inspect active alerts, service metrics, and recent logs for retry and " +
      "error patterns.",
    plan: [
      {
        tool: "getActiveAlerts",
        input: {},
        reason: "read active application/protocol alerts",
      },
      {
        tool: "getServiceMetrics",
        input: {},
        reason: "read payout success rate and retry metrics",
      },
      {
        tool: "getRecentLogs",
        input: { limit: 5 },
        reason: "inspect recent logs for retry/error patterns",
      },
    ],
    analyze: (results) => {
      const alerts =
        output<{ alerts: AlertOut[] }>(results, "getActiveAlerts")?.alerts ?? [];
      const metrics =
        output<{ metrics: MetricOut[] }>(results, "getServiceMetrics")
          ?.metrics ?? [];
      const logs =
        output<{ logs: LogOut[] }>(results, "getRecentLogs")?.logs ?? [];

      const critical = alerts.find((a) => a.severity === "CRITICAL");
      const successRate = metrics.find(
        (m) => m.name === "payout_success_rate",
      )?.value;
      const retries = metrics.find(
        (m) => m.name === "payout_retry_count",
      )?.value;
      const errorLogs = logs.filter((l) => l.level === "ERROR");

      const ev: Evidence[] = [];
      if (critical) {
        ev.push(
          evidence(
            "alerts",
            "alert",
            critical.id,
            `${critical.name}: ${critical.description}`,
          ),
        );
      }
      if (successRate !== undefined) {
        ev.push(
          evidence(
            "metrics",
            "metric",
            "payout_success_rate",
            `payout success rate is ${(successRate * 100).toFixed(0)}%`,
          ),
        );
      }
      if (retries !== undefined) {
        ev.push(
          evidence(
            "metrics",
            "metric",
            "payout_retry_count",
            `payout worker has retried ${retries} times`,
          ),
        );
      }
      if (errorLogs.length > 0) {
        ev.push(
          evidence(
            "logs",
            "log",
            errorLogs[0]!.service,
            errorLogs[0]!.message,
          ),
        );
      }

      const lowSuccess = successRate !== undefined && successRate < 0.5;
      const confidence =
        0.6 + (critical ? 0.15 : 0) + (lowSuccess ? 0.1 : 0);
      const severity: Severity = critical?.severity ?? "HIGH";

      return successFinding({
        investigator: "APPLICATION",
        summary: critical
          ? `Application telemetry confirms elevated payout failures: ${critical.name}.`
          : "Application telemetry inspected for payout retry/error patterns.",
        evidence: ev,
        confidence,
        severity,
        metadata: {
          successRate: successRate ?? null,
          retries: retries ?? null,
          errorLogCount: errorLogs.length,
        },
      });
    },
  });
}
