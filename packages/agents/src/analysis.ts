import {
  InvestigatorError,
  nowIso,
  round2,
  type Evidence,
  type InvestigationFinding,
  type InvestigatorKind,
  type Severity,
} from "@aegis/shared";
import type { ToolExecResult } from "@aegis/trueforge";

/** Shapes of the tool outputs the analyzers consume (validated upstream). */
export interface BalanceOut {
  address: string;
  balanceWei: string;
  symbol: string;
}
export interface ChainTxOut {
  hash: string;
  status: "SUCCESS" | "REVERTED" | "PENDING";
  valueWei: string;
  error?: string;
}
export interface ReceiptOut {
  hash: string;
  status: string;
  revertReason?: string;
}
export interface TreasuryBalanceOut {
  address: string;
  balanceWei: string;
  requiredGasReserveWei: string;
  sufficient: boolean;
  shortfallWei: string;
}
export interface PayoutFailureOut {
  id: string;
  txHash: string;
  reason: string;
  attempts: number;
}
export interface AlertOut {
  id: string;
  name: string;
  severity: Severity;
  description: string;
}
export interface MetricOut {
  name: string;
  value: number;
  unit: string;
}
export interface LogOut {
  level: string;
  service: string;
  message: string;
}

/** Fetch a non-blocked tool output by tool name. */
export function output<T>(
  results: ToolExecResult[],
  tool: string,
): T | undefined {
  const r = results.find((x) => x.tool === tool && !x.blocked);
  return r ? (r.output as T) : undefined;
}

export function wasBlocked(results: ToolExecResult[], tool: string): boolean {
  return results.some((x) => x.tool === tool && x.blocked);
}

export function evidence(
  source: string,
  type: string,
  reference: string,
  observation: string,
): Evidence {
  return { source, type, reference, observation, timestamp: nowIso() };
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Convert wei (decimal string) to an ETH number for display. */
export function weiToEth(wei: string): number {
  return Number(BigInt(wei)) / 1e18;
}

export function successFinding(params: {
  investigator: InvestigatorKind;
  summary: string;
  evidence: Evidence[];
  confidence: number;
  severity: Severity;
  metadata?: Record<string, unknown>;
}): InvestigationFinding {
  if (params.evidence.length === 0) {
    // A successful finding must be backed by evidence.
    throw new InvestigatorError(
      `${params.investigator} produced no evidence`,
    );
  }
  return {
    investigator: params.investigator,
    status: "SUCCESS",
    summary: params.summary,
    evidence: params.evidence,
    confidence: round2(clamp01(params.confidence)),
    severity: params.severity,
    timestamp: nowIso(),
    metadata: params.metadata ?? {},
  };
}

/**
 * A successful-but-empty finding: the investigator ran but had nothing to
 * analyze (e.g. no EVM address on a non-EVM chain, or no code repository). It
 * carries a coverage note as evidence and low confidence, so the investigation
 * stays COMPLETE instead of being dragged to PARTIAL by a hard failure.
 */
export function noDataFinding(
  investigator: InvestigatorKind,
  source: string,
  reason: string,
): InvestigationFinding {
  return {
    investigator,
    status: "SUCCESS",
    summary: reason,
    evidence: [evidence(source, "coverage", investigator.toLowerCase(), reason)],
    confidence: 0.1,
    severity: "LOW",
    timestamp: nowIso(),
    metadata: { noData: true },
  };
}

export function failedFinding(
  investigator: InvestigatorKind,
  message: string,
): InvestigationFinding {
  return {
    investigator,
    status: "FAILED",
    summary: `Investigation failed: ${message}`,
    evidence: [],
    confidence: 0,
    severity: "LOW",
    timestamp: nowIso(),
    metadata: { error: message },
  };
}
