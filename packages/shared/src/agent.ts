import { z } from "zod";
import { CASE_STATUSES, PRIORITIES, RECOMMENDED_ACTIONS, type CaseStatus, type CaseType, type Priority, type RecommendedAction } from "./enums";
import { batchSimulationSchema, type BatchSimulationResult } from "./simulator";
import type { PtpSweepResult } from "./ptp";
import type { StatsSummary } from "./types";

export const DEFAULT_BATCH_RECOVERY_STATUSES = [
  "OPEN",
  "DIAGNOSED",
  "ACTION_TAKEN",
  "WAITING_CUSTOMER",
] as const satisfies readonly CaseStatus[];

/** POST /agent/recover-batch */
export const batchRecoveryRunRequestSchema = z.object({
  /** Max active cases the agent should work in one run. */
  limit: z.number().int().min(1).max(500).optional().default(50),
  /** Case statuses eligible for this run. */
  statuses: z.array(z.enum(CASE_STATUSES)).min(1).max(CASE_STATUSES.length).optional().default([...DEFAULT_BATCH_RECOVERY_STATUSES]),
  /** Optional demo helper: generate fresh at-risk cases immediately before the run. */
  simulateBatch: batchSimulationSchema.optional(),
  /** Demo helper: simulate whether customers complete the requested action. */
  verifyWaitingCustomers: z.boolean().optional().default(true),
  /** Applied only when verifyWaitingCustomers=true. */
  verificationSuccessRatePct: z.number().int().min(0).max(100).optional().default(60),
  /** Process due promise-to-pay rows after the main case loop. */
  runPromiseSweep: z.boolean().optional().default(true),
});
export type BatchRecoveryRunRequest = z.infer<typeof batchRecoveryRunRequestSchema>;

export interface BatchRecoveryActionBreakdown {
  action: RecommendedAction;
  count: number;
}

export interface BatchRecoveryFailure {
  caseId: number;
  step: "diagnose" | "execute" | "verify";
  error: string;
}

export interface BatchRecoveryCaseOutcome {
  caseId: number;
  type: CaseType;
  priority: Priority;
  startedStatus: CaseStatus;
  endedStatus: string;
  diagnosed: boolean;
  requestedAction: RecommendedAction | null;
  executedAction: RecommendedAction | null;
  policyDecision: "ALLOW" | "DENY" | null;
  recoveredAmount: number | null;
  note: string;
}

export interface BatchRecoveryRunResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  selectedCases: number;
  simulatedCases: number;
  simulated: BatchSimulationResult | null;
  diagnosedCases: number;
  executedCases: number;
  policyAllowed: number;
  policyDenied: number;
  waitingForCustomer: number;
  recoveredCount: number;
  recoveredAmount: number;
  escalatedCount: number;
  skippedCount: number;
  actionBreakdown: BatchRecoveryActionBreakdown[];
  failures: BatchRecoveryFailure[];
  outcomes: BatchRecoveryCaseOutcome[];
  promiseSweep: PtpSweepResult | null;
  summaryAfterRun: StatsSummary;
}

export const BATCH_RECOVERY_PRIORITY_ORDER = PRIORITIES;
