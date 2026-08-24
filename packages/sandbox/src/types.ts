export interface SandboxRequest {
  /** Self-contained ES module source to execute. Treated as untrusted. */
  code: string;
  /** JSON-serializable input made available to the program as SANDBOX_INPUT. */
  input?: unknown;
  timeoutMs?: number;
  /** Cap on captured stdout/stderr bytes (each). */
  maxOutputBytes?: number;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Which isolation boundary actually executed this run. */
  driver: "docker" | "subprocess";
}

export interface SandboxDriver {
  readonly name: "docker" | "subprocess";
  run(req: SandboxRequest): Promise<SandboxResult>;
}

export const DEFAULT_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_OUTPUT = 256 * 1024;
