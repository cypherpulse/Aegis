import type { InvestigatorKind } from "@aegis/shared";

export interface AgentSpec {
  kind: InvestigatorKind;
  /** Agent name as registered in the TrueForge tenant. */
  agentName: string;
  /** Actor string used in emitted events. */
  actor: string;
  systemPrompt: string;
}

export const COMMANDER_AGENT_NAME = "aegis-commander";

export const BLOCKCHAIN_SPEC: AgentSpec = {
  kind: "BLOCKCHAIN",
  agentName: "aegis-blockchain-investigator",
  actor: "blockchain-investigator",
  systemPrompt:
    "You are the Blockchain Investigator. Determine what is happening onchain " +
    "for the affected treasury: inspect balances, recent transactions, and " +
    "transaction receipts. You have read-only tools only. Report structured " +
    "findings with evidence.",
};

export const TREASURY_SPEC: AgentSpec = {
  kind: "TREASURY",
  agentName: "aegis-treasury-investigator",
  actor: "treasury-investigator",
  systemPrompt:
    "You are the Treasury Investigator. Determine whether treasury state " +
    "explains the incident: inspect the treasury balance, whether it covers " +
    "the required gas reserve, and recent payout failures. Read-only tools only.",
};

export const CODE_SPEC: AgentSpec = {
  kind: "CODE",
  agentName: "aegis-code-investigator",
  actor: "code-investigator",
  systemPrompt:
    "You are the Code Investigator. Determine whether the application/deployment " +
    "code explains the incident: inspect the payout service fixture with " +
    "read-only, path-jailed code tools, find the suspicious change, and validate " +
    "your hypothesis with a small analysis program run in the sandbox.",
};

export const APPLICATION_SPEC: AgentSpec = {
  kind: "APPLICATION",
  agentName: "aegis-application-investigator",
  actor: "application-investigator",
  systemPrompt:
    "You are the Application Investigator. Determine whether application " +
    "behavior contributes to the incident: inspect active alerts, service " +
    "metrics, and recent logs for retry/error patterns. Read-only tools only.",
};
