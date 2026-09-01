import { z } from "zod";
import { RECOMMENDED_ACTIONS, RECOVERABILITY_LEVELS } from "./enums";

/**
 * Schema-validated AI diagnosis output (guide §12–13).
 * The LLM must return exactly this shape; anything else is rejected
 * before it can reach the policy engine.
 */
export const aiDecisionSchema = z.object({
  classification: z
    .string()
    .min(3)
    .describe("Short category, e.g. payment_method_issue | temporary_shortfall | bank_decline"),
  rootCause: z.string().min(2).describe("Machine-readable root cause, e.g. expired_card"),
  recoverability: z.enum(RECOVERABILITY_LEVELS),
  recommendedAction: z.enum(RECOMMENDED_ACTIONS),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(10).max(500).describe("One-sentence human-readable justification"),
});
export type AiDecision = z.infer<typeof aiDecisionSchema>;

/** Input context given to the diagnoser for a case (guide §12). */
export const diagnosisInputSchema = z.object({
  caseId: z.number().int().positive(),
  caseType: z.string(),
  failureReason: z.string().nullable(),
  previousAttempts: z.number().int().min(0),
  successfulPayments: z.number().int().min(0),
  failedPayments: z.number().int().min(0),
  amountAtRisk: z.number().nonnegative(),
  currency: z.string().default("INR"),
  customerTenureDays: z.number().int().min(0).default(0),
  daysOverdue: z.number().int().min(0).nullable().default(null),
});
export type DiagnosisInput = z.infer<typeof diagnosisInputSchema>;

