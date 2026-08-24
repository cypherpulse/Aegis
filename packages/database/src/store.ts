import {
  type IncidentStatus,
  type InvestigationFinding,
  type InvestigationStage,
  type InvestigationStatus,
  type InvestigationStore,
  type RootCause,
} from "@aegis/shared";
import type { Database } from "./client.js";
import {
  createInvestigatorRun,
  saveFinding,
  saveRootCause,
  updateIncidentStatus,
  updateInvestigation,
  updateInvestigatorRun,
} from "./repositories.js";

function incidentStatusFor(status: InvestigationStatus): IncidentStatus {
  if (status === "FAILED") return "FAILED";
  if (status === "RUNNING" || status === "QUEUED") return "INVESTIGATING";
  return "INVESTIGATION_COMPLETE";
}

/**
 * Drizzle-backed persistence for a single investigation. Each engine transition
 * is written to Postgres; state changes use the repository transaction helpers.
 */
export class DrizzleStore implements InvestigationStore {
  constructor(
    private readonly db: Database,
    readonly investigationId: string,
    private readonly incidentId: string,
  ) {}

  async started(params: { sessionId: string; mode: string }): Promise<void> {
    await updateInvestigation(this.db, this.investigationId, {
      status: "RUNNING",
      stage: "COMMANDER",
      sessionId: params.sessionId,
      startedAt: new Date().toISOString(),
    });
    await updateIncidentStatus(this.db, this.incidentId, "INVESTIGATING");
  }

  async stage(stage: InvestigationStage): Promise<void> {
    await updateInvestigation(this.db, this.investigationId, { stage });
  }

  async recordFinding(finding: InvestigationFinding): Promise<void> {
    const runId = await createInvestigatorRun(this.db, {
      investigationId: this.investigationId,
      investigator: finding.investigator,
    });
    await updateInvestigatorRun(this.db, runId, {
      status: finding.status === "SUCCESS" ? "COMPLETE" : "FAILED",
      completedAt: new Date().toISOString(),
      ...(finding.status === "FAILED"
        ? { failureReason: finding.summary }
        : {}),
    });
    await saveFinding(this.db, this.investigationId, finding);
  }

  async recordRootCause(rc: RootCause): Promise<void> {
    await saveRootCause(this.db, this.investigationId, rc);
  }

  async finished(
    status: InvestigationStatus,
    failureReason?: string,
  ): Promise<void> {
    await updateInvestigation(this.db, this.investigationId, {
      status,
      stage: "DONE",
      completedAt: new Date().toISOString(),
      ...(failureReason ? { failureReason } : {}),
    });
    await updateIncidentStatus(
      this.db,
      this.incidentId,
      incidentStatusFor(status),
    );
  }
}
