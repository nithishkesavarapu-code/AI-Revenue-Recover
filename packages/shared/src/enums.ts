/** Case scenario types — mirrors Prisma enum `CaseType`. */
export const CASE_TYPES = [
  "FAILED_PAYMENT",
  "CHECKOUT_ABANDONMENT",
  "FAILED_SUBSCRIPTION",
  "OVERDUE_INVOICE",
  "MANDATE_FAILURE",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

/** Lifecycle statuses — mirrors Prisma enum `CaseStatus`. */
export const CASE_STATUSES = [
  "OPEN",
  "DIAGNOSED",
  "ACTION_TAKEN",
  "WAITING_CUSTOMER",
  "RECOVERED",
  "ESCALATED",
  "CLOSED_LOST",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const FAILURE_REASONS = [
  "EXPIRED_CARD",
  "INSUFFICIENT_FUNDS",
  "DECLINED_BY_BANK",
  "AUTHENTICATION_FAILED",
  "TECHNICAL_ERROR",
  "CUSTOMER_DROPOFF",
  "UNKNOWN",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

/** The only actions the agent is ever allowed to take (guide §5). */
export const RECOMMENDED_ACTIONS = [
  "RETRY_PAYMENT",
  "SEND_PAYMENT_LINK",
  "SEND_PAYMENT_UPDATE_LINK",
  "SEND_EMAIL",
  "SEND_SMS",
  "SCHEDULE_RETRY",
  "CREATE_ESCALATION",
  "CLOSE_CASE",
  "NO_ACTION",
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const RECOVERABILITY_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type Recoverability = (typeof RECOVERABILITY_LEVELS)[number];

export const CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "VOICE"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CONTACT_STATUSES = ["NOT_SENT", "SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED", "FAILED"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "SUCCESS", "FAILED", "RETRY_SCHEDULED"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];
