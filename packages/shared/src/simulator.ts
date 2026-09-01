import { z } from "zod";

/**
 * Failure reasons that make sense for a simulated *payment* event.
 * (CUSTOMER_DROPOFF belongs to checkout abandonment instead.)
 */
export const PAYMENT_FAILURE_REASONS = [
  "EXPIRED_CARD",
  "INSUFFICIENT_FUNDS",
  "DECLINED_BY_BANK",
  "AUTHENTICATION_FAILED",
  "TECHNICAL_ERROR",
  "UNKNOWN",
] as const;
export type PaymentFailureReason = (typeof PAYMENT_FAILURE_REASONS)[number];

// ---------- One-off event inputs (all fields optional -> fully random) ----------

export const paymentFailureEventSchema = z.object({
  customerId: z.number().int().positive().optional(),
  amount: z.number().positive().max(10_000_000).optional(),
  failureReason: z.enum(PAYMENT_FAILURE_REASONS).optional(),
});
export type PaymentFailureEventInput = z.infer<typeof paymentFailureEventSchema>;

export const checkoutAbandonmentEventSchema = z.object({
  customerId: z.number().int().positive().optional(),
  cartValue: z.number().positive().max(10_000_000).optional(),
});
export type CheckoutAbandonmentEventInput = z.infer<typeof checkoutAbandonmentEventSchema>;

export const subscriptionFailureEventSchema = z.object({
  customerId: z.number().int().positive().optional(),
  amount: z.number().positive().max(10_000_000).optional(),
});
export type SubscriptionFailureEventInput = z.infer<typeof subscriptionFailureEventSchema>;

export const invoiceOverdueEventSchema = z.object({
  customerId: z.number().int().positive().optional(),
  amount: z.number().positive().max(50_000_000).optional(),
  daysOverdue: z.number().int().min(1).max(365).optional(),
});
export type InvoiceOverdueEventInput = z.infer<typeof invoiceOverdueEventSchema>;

// ---------- Batch generation ----------

export const batchSimulationSchema = z.object({
  failedPayments: z.number().int().min(0).max(300).optional(),
  checkoutAbandonments: z.number().int().min(0).max(300).optional(),
  subscriptionFailures: z.number().int().min(0).max(300).optional(),
  invoiceOverdues: z.number().int().min(0).max(300).optional(),
});
export type BatchSimulationInput = z.infer<typeof batchSimulationSchema>;

/** Result shape returned by POST /simulator/batch. */
export interface BatchSimulationResult {
  createdCounts: {
    failedPayments: number;
    checkoutAbandonments: number;
    subscriptionFailures: number;
    invoiceOverdues: number;
  };
  totalCases: number;
  durationMs: number;
}
