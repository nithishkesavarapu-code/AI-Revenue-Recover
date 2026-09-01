import { z } from "zod";

/** POST /ai/diagnose/:caseId */
export const diagnoseCaseRequestSchema = z.object({
  /** Re-run the diagnosis even if a decision already exists. */
  force: z.boolean().optional().default(false),
});
export type DiagnoseCaseRequest = z.infer<typeof diagnoseCaseRequestSchema>;

/** POST /ai/diagnose/pending */
export const diagnosePendingRequestSchema = z.object({
  /** Max number of OPEN cases to diagnose in this run. */
  limit: z.number().int().min(1).max(500).optional().default(100),
});
export type DiagnosePendingRequest = z.infer<typeof diagnosePendingRequestSchema>;

/** Summary returned by the pending-diagnosis batch endpoint. */
export interface PendingDiagnosisResult {
  provider: string;
  total: number;
  diagnosed: number;
  skippedExisting: number;
  failed: Array<{ caseId: number; error: string }>;
  durationMs: number;
}
