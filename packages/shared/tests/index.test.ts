import { describe, expect, it } from "vitest";
import {
  IncidentSchema,
  parseIncident,
  safeParseIncident,
  parseFinding,
  parseUnifiedEvidence,
  makeEvent,
  AgentEventSchema,
  round2,
} from "../src/index.js";

const validIncident = {
  id: "INC-001",
  type: "TREASURY_GAS_DEPLETION",
  severity: "CRITICAL",
  title: "Treasury gas depletion",
  description: "Payout transactions failing due to insufficient gas.",
  affectedProtocol: "Aegis Demo Protocol",
  chain: { name: "Base Sepolia", chainId: 84532 },
  detectedAt: new Date().toISOString(),
  status: "DETECTED",
  metadata: {},
};

describe("incident domain", () => {
  it("parses a valid incident", () => {
    const inc = parseIncident(validIncident);
    expect(inc.id).toBe("INC-001");
    expect(inc.type).toBe("TREASURY_GAS_DEPLETION");
  });

  it("rejects an unknown severity", () => {
    const res = safeParseIncident({ ...validIncident, severity: "SPICY" });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown incident type", () => {
    const res = IncidentSchema.safeParse({ ...validIncident, type: "MEME" });
    expect(res.success).toBe(false);
  });

  it("defaults metadata to an empty object", () => {
    const { metadata: _omit, ...rest } = validIncident;
    const inc = parseIncident(rest);
    expect(inc.metadata).toEqual({});
  });
});

describe("finding domain", () => {
  it("parses a valid finding", () => {
    const finding = parseFinding({
      investigator: "TREASURY",
      status: "SUCCESS",
      summary: "Treasury balance below payout cost",
      evidence: [
        {
          source: "treasury-simulator",
          type: "balance",
          reference: "0xTreasury",
          observation: "balance 0.0004 ETH",
          timestamp: new Date().toISOString(),
        },
      ],
      confidence: 0.9,
      severity: "CRITICAL",
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    expect(finding.confidence).toBe(0.9);
  });

  it("rejects confidence out of range", () => {
    expect(() =>
      parseFinding({
        investigator: "TREASURY",
        status: "SUCCESS",
        summary: "x",
        evidence: [],
        confidence: 1.5,
        severity: "LOW",
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe("unified evidence domain", () => {
  it("rejects an empty hypothesis title", () => {
    expect(() =>
      parseUnifiedEvidence({
        incidentId: "INC-001",
        findings: [],
        correlatedSignals: [],
        hypothesis: { title: "", confidence: 0.5, rationale: "r" },
        summary: "s",
        status: "COMPLETE",
        generatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe("events", () => {
  it("builds a schema-valid event with generated id + timestamp", () => {
    const evt = makeEvent({
      incidentId: "INC-001",
      type: "incident.created",
      actor: "system",
      payload: { note: "hello" },
    });
    expect(AgentEventSchema.safeParse(evt).success).toBe(true);
    expect(evt.id.startsWith("evt_")).toBe(true);
  });
});

describe("util", () => {
  it("rounds to 2 decimals", () => {
    expect(round2(0.96666)).toBe(0.97);
  });
});
