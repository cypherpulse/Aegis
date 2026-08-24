import type { InvestigationFinding } from "./finding.js";
import type { RootCause } from "./root-cause.js";

export type InvestigationStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETE"
  | "PARTIAL"
  | "FAILED";

export type InvestigationStage =
  | "CREATED"
  | "COMMANDER"
  | "FUSION"
  | "CODE"
  | "ROOT_CAUSE"
  | "DONE";

/**
 * Persistence port injected into the investigation engine. Keeps the engine
 * framework-free: the API supplies a Drizzle-backed store, tests/demo use the
 * no-op NullStore.
 */
export interface InvestigationStore {
  readonly investigationId: string | null;
  started(params: { sessionId: string; mode: string }): Promise<void>;
  stage(stage: InvestigationStage): Promise<void>;
  recordFinding(finding: InvestigationFinding): Promise<void>;
  recordRootCause(rc: RootCause): Promise<void>;
  finished(status: InvestigationStatus, failureReason?: string): Promise<void>;
}

/** No-op store — the engine runs fully without persistence. */
export class NullStore implements InvestigationStore {
  readonly investigationId = null;
  async started(): Promise<void> {}
  async stage(): Promise<void> {}
  async recordFinding(): Promise<void> {}
  async recordRootCause(): Promise<void> {}
  async finished(): Promise<void> {}
}
