import { z } from "zod";

/** Explicit approval state for the human-in-the-loop boundary (Phase 2 §22). */
export const ApprovalStateSchema = z.enum([
  "NOT_REQUIRED",
  "REQUIRED",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
]);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;
