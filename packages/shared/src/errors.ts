/**
 * Typed error hierarchy so failures are structured and API-safe. `toSafeJSON`
 * intentionally omits stack traces and internal details from anything that
 * could be returned to a client (spec §21).
 */
export type AegisErrorCode =
  | "VALIDATION"
  | "TOOL"
  | "INVESTIGATOR"
  | "FUSION"
  | "TRUEFORGE"
  | "APPROVAL"
  | "TIMEOUT";

export class AegisError extends Error {
  readonly code: AegisErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: AegisErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }

  /** Client-safe projection: code + message only, no stack, no internals. */
  toSafeJSON(): { code: AegisErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export class ValidationError extends AegisError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION", message, details);
  }
}

export class ToolError extends AegisError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TOOL", message, details);
  }
}

export class InvestigatorError extends AegisError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("INVESTIGATOR", message, details);
  }
}

export class FusionError extends AegisError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("FUSION", message, details);
  }
}

export class TrueForgeError extends AegisError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TRUEFORGE", message, details);
  }
}

export class ApprovalError extends AegisError {
  constructor(
    code: "APPROVAL" | "TIMEOUT",
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
  }
}

/** Normalize any thrown value into an API-safe shape. */
export function toSafeError(err: unknown): {
  code: AegisErrorCode | "UNKNOWN";
  message: string;
} {
  if (err instanceof AegisError) return err.toSafeJSON();
  return { code: "UNKNOWN", message: "An unexpected error occurred." };
}
