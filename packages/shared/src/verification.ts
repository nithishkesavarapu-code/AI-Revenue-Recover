import { z } from "zod";

/** Simulated customer response to a recovery action. */
export const CUSTOMER_OUTCOMES = ["SUCCESS", "FAILURE"] as const;
export type CustomerOutcome = (typeof CUSTOMER_OUTCOMES)[number];

export const simulateCustomerRequestSchema = z.object({
  outcome: z.enum(CUSTOMER_OUTCOMES).optional().default("SUCCESS"),
  /** Optional failure reason recorded when outcome is FAILURE. */
  failureReason: z.string().max(100).optional(),
});
export type SimulateCustomerRequest = z.infer<typeof simulateCustomerRequestSchema>;

/** Result of a single customer-action simulation. */
export interface VerificationResult {
  caseId: number;
  outcome: CustomerOutcome;
  paymentReference: string | null;
  recoveredAmount: number | null;
  caseStatus: string;
  detail: string;
}

export const batchVerifyRequestSchema = z.object({
  /** Percentage of waiting customers that pay (0–100). Default 60. */
  successRatePct: z.number().int().min(0).max(100).optional().default(60),
  /** Max cases to process in this run. */
  limit: z.number().int().min(1).max(500).optional().default(100),
});
export type BatchVerifyRequest = z.infer<typeof batchVerifyRequestSchema>;

/** Summary returned by the batch verification endpoint. */
export interface BatchVerificationResult {
  processed: number;
  recoveredCount: number;
  failedCount: number;
  recoveredAmount: number;
  skipped: number;
  durationMs: number;
}
