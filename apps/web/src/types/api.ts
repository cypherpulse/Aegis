// Hand-written types for the Aegis REST contract (Part IV.1 / IV.2).

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentType = "TREASURY_GAS_DEPLETION";

export type IncidentStatus =
  "DETECTED" | "INVESTIGATING" | "FUSION_IN_PROGRESS" | "INVESTIGATION_COMPLETE" | "FAILED";

export type InvestigationStatus = "QUEUED" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED";

export type InvestigationStage =
  "CREATED" | "COMMANDER" | "FUSION" | "CODE" | "ROOT_CAUSE" | "DONE";

export type ApprovalState = "NOT_REQUIRED" | "REQUIRED" | "APPROVED" | "REJECTED" | "EXPIRED";

export type InvestigatorKind = "BLOCKCHAIN" | "TREASURY" | "APPLICATION" | "CODE";

export type FindingStatus = "SUCCESS" | "FAILED";

export type RootCauseStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT_EVIDENCE" | "FAILED";

export interface Chain {
  name: string;
  chainId: number;
}

export interface Incident {
  id: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  description: string;
  affectedProtocol: string;
  chain: Chain;
  detectedAt: string;
  status: IncidentStatus;
  metadata: Record<string, unknown>;
}

export interface Investigation {
  id: string;
  incidentId: string;
  sessionId: string | null;
  status: InvestigationStatus;
  stage: InvestigationStage;
  approvalState: ApprovalState;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
}

export interface Evidence {
  source: string;
  type: string;
  reference: string;
  observation: string;
  timestamp: string;
}

export interface Finding {
  investigator: InvestigatorKind;
  status: FindingStatus;
  summary: string;
  evidence: Evidence[];
  confidence: number;
  severity: Severity;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ContributingFactor {
  description: string;
  weight: number;
}

export interface RootCause {
  incidentId: string;
  title: string;
  explanation: string;
  confidence: number;
  severity: Severity;
  evidence: Evidence[];
  contributingFactors: ContributingFactor[];
  status: RootCauseStatus;
  generatedAt: string;
}

export interface ApiEnvelope<T> {
  data: T | null;
  error: ApiErrorBody | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string> | undefined;
}

export interface IncidentListResponse {
  items: Incident[];
  total: number;
  limit: number;
  offset: number;
}

export interface IncidentDetailResponse {
  incident: Incident;
  investigation: Investigation | null;
  stage: InvestigationStage | null;
  findings: Finding[];
  rootCause: RootCause | null;
}

export interface CreateIncidentResponse {
  incidentId: string;
  investigationId: string;
  status: "QUEUED";
}

export interface InvestigateResponse {
  investigationId: string;
  status: InvestigationStatus;
}

export interface CreateIncidentBody {
  type?: IncidentType;
  severity?: Severity;
  title?: string;
  description?: string;
  affectedProtocol?: string;
  chain?: Chain;
  metadata?: Record<string, unknown>;
}

export interface IncidentListQuery {
  status?: IncidentStatus;
  severity?: Severity;
  chain?: string;
  limit?: number;
  offset?: number;
}

// ---- Platform resources (auth, protocols, investigation sub-resources) ----

export interface User {
  id: string;
  authProvider: string;
  walletAddress: string | null;
  email: string | null;
  displayName: string | null;
}

export interface AssistantAction {
  type: string;
  incidentId: string;
  investigationId?: string;
}

export interface AssistantReply {
  reply: string;
  mode: "harness" | "local";
  actions: AssistantAction[];
  incidentId?: string;
}

export interface Protocol {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  primaryChain: string | null;
  githubRepository: string | null;
  status?: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  protocolId: string;
  name: string;
  chain: string;
  address: string;
  type: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryAddress {
  id: string;
  protocolId: string;
  address: string;
  chain: string;
  label: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringConfig {
  protocolId: string;
  contractMonitoring: boolean;
  treasuryMonitoring: boolean;
  applicationMonitoring: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

export interface IntegrationKey {
  id: string;
  protocolId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
export interface IntegrationKeyWithSecret extends IntegrationKey {
  secret: string;
}

export interface CreateProtocolBody {
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  primaryChain?: string;
  githubRepository?: string;
}
export interface CreateContractBody {
  name: string;
  chain: string;
  address: string;
  type?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}
export interface CreateTreasuryBody {
  address: string;
  chain: string;
  label?: string;
  status?: string;
}
export interface ReportIncidentBody {
  title: string;
  description: string;
  severity?: Severity;
  chain: string;
  contractAddress?: string;
  transactionHash?: string;
  blockNumber?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentView {
  id: string;
  role: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  toolCalls: number;
  findings: number;
}
export interface ToolView {
  toolName: string;
  agent: string;
  status: "called" | "completed";
  timestamp: string;
  durationMs: number | null;
  inputSummary: string | null;
}
export interface EvidenceRow extends Evidence {
  id: string;
  metadata: Record<string, unknown>;
}
export interface TimelineEntry {
  seq: number;
  type: string;
  actor: string;
  timestamp: string;
  summary: Record<string, unknown>;
}
export interface InvestigationFull {
  investigation: Investigation;
  status: InvestigationStatus;
  stage: InvestigationStage;
  startedAt: string | null;
  completedAt: string | null;
  approvalState: ApprovalState;
  agents: AgentView[];
  findings: Finding[];
  evidence: EvidenceRow[];
  rootCause: RootCause | null;
}
