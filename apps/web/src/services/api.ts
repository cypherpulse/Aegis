// Single Aegis API client. Unwraps the { data, error } envelope (§IV.0).

import type {
  ApiEnvelope,
  ApiErrorBody,
  CreateIncidentBody,
  CreateIncidentResponse,
  Finding,
  IncidentDetailResponse,
  IncidentListQuery,
  IncidentListResponse,
  Investigation,
  InvestigateResponse,
  RootCause,
} from "@/types/api";
import type { EventsResponse } from "@/types/events";
import type {
  AgentView,
  AssistantReply,
  Contract,
  CreateContractBody,
  CreateProtocolBody,
  CreateTreasuryBody,
  EvidenceRow,
  IntegrationKey,
  IntegrationKeyWithSecret,
  InvestigationFull,
  MonitoringConfig,
  Protocol,
  ReportIncidentBody,
  TimelineEntry,
  ToolView,
  TreasuryAddress,
  User,
} from "@/types/api";

export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:4000";

export const API_PREFIX = "/api/v1";

// ---- Bearer token auth (no cross-site cookies needed) -------------------
const TOKEN_KEY = "aegis_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Capture a `#token=...` fragment (left by the Google OAuth callback), store it,
 * and clean it out of the URL. Call once on app load.
 */
export function captureAuthTokenFromUrl(): void {
  try {
    const m = window.location.hash.match(/token=([^&]+)/);
    if (m?.[1]) {
      setToken(decodeURIComponent(m[1]));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch {
    /* ignore */
  }
}

export class AegisApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string> | undefined;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    fields?: Record<string, string> | undefined;
  }) {
    super(params.message);
    this.name = "AegisApiError";
    this.code = params.code;
    this.status = params.status;
    this.fields = params.fields;
  }
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return typeof value === "object" && value !== null && "data" in value && "error" in value;
}

function toErrorBody(value: unknown): ApiErrorBody | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record["code"] !== "string" || typeof record["message"] !== "string") return null;
  const fields =
    typeof record["fields"] === "object" && record["fields"] !== null
      ? (record["fields"] as Record<string, string>)
      : undefined;
  return { code: record["code"], message: record["message"], fields };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const token = getToken();
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include", // still send the cookie for same-origin / local dev
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new AegisApiError({
      code: "NETWORK",
      message: `Aegis API unreachable at ${API_BASE_URL}. Is the backend running?`,
      status: 0,
    });
  }

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new AegisApiError({
        code: "MALFORMED",
        message: "Malformed response from Aegis API (expected JSON).",
        status: response.status,
      });
    }
  }

  if (!isEnvelope(body)) {
    if (!response.ok) {
      throw new AegisApiError({
        code: "ERROR",
        message: `Aegis API returned HTTP ${response.status}.`,
        status: response.status,
      });
    }
    throw new AegisApiError({
      code: "MALFORMED",
      message: "Unexpected response shape from Aegis API (missing { data, error } envelope).",
      status: response.status,
    });
  }

  const error = toErrorBody(body.error);
  if (error) {
    throw new AegisApiError({ ...error, status: response.status });
  }

  if (body.data === null || body.data === undefined) {
    throw new AegisApiError({
      code: "MALFORMED",
      message: "Aegis API returned an empty payload.",
      status: response.status,
    });
  }

  return body.data as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const aegisApi = {
  createIncident(body: CreateIncidentBody = {}): Promise<CreateIncidentResponse> {
    return request<CreateIncidentResponse>(`${API_PREFIX}/incidents`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  listIncidents(params: IncidentListQuery = {}): Promise<IncidentListResponse> {
    return request<IncidentListResponse>(`${API_PREFIX}/incidents${query({ ...params })}`);
  },

  getIncident(id: string): Promise<IncidentDetailResponse> {
    return request<IncidentDetailResponse>(`${API_PREFIX}/incidents/${encodeURIComponent(id)}`);
  },

  investigate(id: string): Promise<InvestigateResponse> {
    return request<InvestigateResponse>(
      `${API_PREFIX}/incidents/${encodeURIComponent(id)}/investigate`,
      { method: "POST" },
    );
  },

  getEvents(
    id: string,
    params: { afterSeq?: number; limit?: number } = {},
  ): Promise<EventsResponse> {
    return request<EventsResponse>(
      `${API_PREFIX}/incidents/${encodeURIComponent(id)}/events${query({ ...params })}`,
    );
  },

  getInvestigation(
    id: string,
  ): Promise<{ investigation: Investigation; findings: Finding[]; rootCause: RootCause | null }> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}`);
  },

  getFindings(id: string): Promise<{ findings: Finding[] }> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}/findings`);
  },

  getRootCause(id: string): Promise<{ rootCause: RootCause }> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}/root-cause`);
  },

  // ---- Investigation sub-resources ----
  getInvestigationFull(id: string): Promise<InvestigationFull> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}/full`);
  },
  getAgents(id: string): Promise<{ agents: AgentView[] }> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}/agents`);
  },
  getTools(id: string): Promise<{ tools: ToolView[] }> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}/tools`);
  },
  getEvidence(id: string): Promise<{ evidence: EvidenceRow[] }> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}/evidence`);
  },
  getTimeline(id: string): Promise<{ timeline: TimelineEntry[] }> {
    return request(`${API_PREFIX}/investigations/${encodeURIComponent(id)}/timeline`);
  },

  // ---- Auth ----
  walletNonce(address: string): Promise<{ address: string; nonce: string; message: string }> {
    return request(`${API_PREFIX}/auth/wallet/nonce`, {
      method: "POST",
      body: JSON.stringify({ address }),
    });
  },
  async walletVerify(address: string, signature: string): Promise<{ user: User }> {
    const res = await request<{ user: User; token?: string }>(`${API_PREFIX}/auth/wallet/verify`, {
      method: "POST",
      body: JSON.stringify({ address, signature }),
    });
    if (res.token) setToken(res.token);
    return { user: res.user };
  },
  me(): Promise<{ user: User | null }> {
    return request(`${API_PREFIX}/auth/me`);
  },
  authConfig(): Promise<{ google: boolean }> {
    return request(`${API_PREFIX}/auth/config`);
  },
  async logout(): Promise<void> {
    const token = getToken();
    await fetch(`${API_BASE_URL}${API_PREFIX}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => undefined);
    setToken(null);
  },
  googleAuthUrl(): string {
    return `${API_BASE_URL}${API_PREFIX}/auth/google`;
  },

  // ---- Protocols + resources ----
  listProtocols(params: { limit?: number; offset?: number } = {}): Promise<{
    items: Protocol[];
    total: number;
    limit: number;
    offset: number;
  }> {
    return request(`${API_PREFIX}/protocols${query({ ...params })}`);
  },
  createProtocol(body: CreateProtocolBody): Promise<Protocol> {
    return request(`${API_PREFIX}/protocols`, { method: "POST", body: JSON.stringify(body) });
  },
  getProtocol(id: string): Promise<Protocol> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}`);
  },
  updateProtocol(id: string, body: Partial<CreateProtocolBody>): Promise<Protocol> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async deleteProtocol(id: string): Promise<void> {
    await request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      () => undefined,
    );
  },
  archiveProtocol(id: string): Promise<Protocol> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/archive`, { method: "POST" });
  },
  unarchiveProtocol(id: string): Promise<Protocol> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/unarchive`, {
      method: "POST",
    });
  },
  investigateContract(
    id: string,
    contractId: string,
  ): Promise<{ incidentId: string; investigationId: string; status: string }> {
    return request(
      `${API_PREFIX}/protocols/${encodeURIComponent(id)}/contracts/${encodeURIComponent(contractId)}/investigate`,
      { method: "POST" },
    );
  },
  investigateTreasury(
    id: string,
    addressId: string,
  ): Promise<{ incidentId: string; investigationId: string; status: string }> {
    return request(
      `${API_PREFIX}/protocols/${encodeURIComponent(id)}/treasury/${encodeURIComponent(addressId)}/investigate`,
      { method: "POST" },
    );
  },
  listContracts(id: string): Promise<{ items: Contract[] }> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/contracts`);
  },
  createContract(id: string, body: CreateContractBody): Promise<Contract> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/contracts`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async deleteContract(id: string, contractId: string): Promise<void> {
    await request(
      `${API_PREFIX}/protocols/${encodeURIComponent(id)}/contracts/${encodeURIComponent(contractId)}`,
      { method: "DELETE" },
    ).catch(() => undefined);
  },
  listTreasury(id: string): Promise<{ items: TreasuryAddress[] }> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/treasury`);
  },
  createTreasury(id: string, body: CreateTreasuryBody): Promise<TreasuryAddress> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/treasury`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async deleteTreasury(id: string, addressId: string): Promise<void> {
    await request(
      `${API_PREFIX}/protocols/${encodeURIComponent(id)}/treasury/${encodeURIComponent(addressId)}`,
      { method: "DELETE" },
    ).catch(() => undefined);
  },
  getMonitoring(id: string): Promise<MonitoringConfig> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/monitoring`);
  },
  updateMonitoring(
    id: string,
    body: Partial<
      Pick<MonitoringConfig, "contractMonitoring" | "treasuryMonitoring" | "applicationMonitoring">
    >,
  ): Promise<MonitoringConfig> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/monitoring`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  listIntegrationKeys(id: string): Promise<{ items: IntegrationKey[] }> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/integration-keys`);
  },
  createIntegrationKey(id: string, name: string): Promise<IntegrationKeyWithSecret> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(id)}/integration-keys`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  async deleteIntegrationKey(id: string, keyId: string): Promise<void> {
    await request(
      `${API_PREFIX}/protocols/${encodeURIComponent(id)}/integration-keys/${encodeURIComponent(keyId)}`,
      { method: "DELETE" },
    ).catch(() => undefined);
  },
  reportIncident(
    protocolId: string,
    body: ReportIncidentBody,
  ): Promise<{ incidentId: string; protocolId: string; status: string }> {
    return request(`${API_PREFIX}/protocols/${encodeURIComponent(protocolId)}/incidents`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  assistantChat(message: string, incidentId?: string): Promise<AssistantReply> {
    return request(`${API_PREFIX}/assistant/chat`, {
      method: "POST",
      body: JSON.stringify(incidentId ? { message, incidentId } : { message }),
    });
  },
};

export function streamUrl(incidentId: string): string {
  return `${API_BASE_URL}${API_PREFIX}/incidents/${encodeURIComponent(incidentId)}/events/stream`;
}
