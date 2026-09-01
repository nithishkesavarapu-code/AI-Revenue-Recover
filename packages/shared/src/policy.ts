import { z } from "zod";
import { FAILURE_REASONS, RECOMMENDED_ACTIONS, type RecommendedAction } from "./enums";


/** Actions that attempt another charge. */
export const RETRY_ACTIONS = ["RETRY_PAYMENT", "SCHEDULE_RETRY"] as const;
export type RetryAction = (typeof RETRY_ACTIONS)[number];

/** Actions that reach out to the customer. */
export const CONTACT_ACTIONS = [
  "SEND_PAYMENT_LINK",
  "SEND_PAYMENT_UPDATE_LINK",
  "SEND_EMAIL",
  "SEND_SMS",
] as const;
export type ContactAction = (typeof CONTACT_ACTIONS)[number];

/** Actions exempt from the dispute-stop rule (they don't chase money). */
export const COLLECTION_EXEMPT_ACTIONS = [
  "CREATE_ESCALATION",
  "CLOSE_CASE",
  "NO_ACTION",
] as const;

/**
 * Bounded-agent policy configuration (guide §5–6). All limits are enforced
 * BEFORE any tool runs; the AI recommendation alone can never exceed them.
 */
export interface PolicyConfig {
  /** Max payment-retry executions per recovery case. */
  maxRetryAttemptsPerCase: number;
  /** Failure reasons for which another charge may be attempted. */
  retryableFailureReasons: string[];
  /** Max outbound contact attempts (links/emails/SMS) per case. */
  maxContactAttemptsPerCase: number;
  /** Allowed contact window, 24h clock, IST. */
  contactWindowStartHourIST: number;
  contactWindowEndHourIST: number;
  /** Minimum hours between two outbound contacts on the same case. */
  minHoursBetweenContacts: number;
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  maxRetryAttemptsPerCase: 4,
  retryableFailureReasons: ["INSUFFICIENT_FUNDS", "TECHNICAL_ERROR", "UNKNOWN"],
  maxContactAttemptsPerCase: 3,
  contactWindowStartHourIST: 9,
  contactWindowEndHourIST: 21,
  minHoursBetweenContacts: 20,
};


export interface PolicyRuleResult {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface PolicyDecision {
  decision: "ALLOW" | "DENY";
  action: RecommendedAction;
  /** When DENY, the bounded fallback the agent will take instead. */
  fallbackAction: RecommendedAction | null;
  rules: PolicyRuleResult[];
  reason: string;
  evaluatedAt: string;
}

// ---------- API request/response shapes ----------

export const evaluateActionRequestSchema = z.object({
  /** Override the AI's recommendation to test a specific action against policy. */
  action: z.enum(RECOMMENDED_ACTIONS).optional(),
});
export type EvaluateActionRequest = z.infer<typeof evaluateActionRequestSchema>;

export const executeActionRequestSchema = evaluateActionRequestSchema;

export interface ExecuteActionResult {
  caseId: number;
  policyDecision: PolicyDecision;
  executedAction: RecommendedAction | null;
  executed: boolean;
  detail: string | null;
  caseStatus: string | null;
}
