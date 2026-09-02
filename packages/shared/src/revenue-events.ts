import { z } from "zod";
import { FAILURE_REASONS } from "./enums";

export const REVENUE_EVENT_TYPES = [
  "PAYMENT_FAILED",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "INVOICE_OVERDUE",
  "CHECKOUT_ABANDONED",
] as const;
export type RevenueEventType = (typeof REVENUE_EVENT_TYPES)[number];

const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(5).max(32).optional(),
  company: z.string().trim().min(1).max(160).optional(),
  externalId: z.string().trim().min(1).max(160).optional(),
});

/** Provider-neutral at-risk revenue event accepted from a trusted backend. */
export const revenueEventSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  eventId: z.string().trim().min(1).max(191),
  type: z.enum(REVENUE_EVENT_TYPES),
  occurredAt: z.coerce.date().optional(),
  customer: customerSchema,
  amount: z.number().positive().max(50_000_000),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("INR"),
  sourceReference: z.string().trim().min(1).max(160).optional(),
  failureReason: z.enum(FAILURE_REASONS).optional(),
  paymentMethod: z.enum(["CARD", "UPI", "NETBANKING", "WALLET", "BANK_TRANSFER"]).optional(),
  daysOverdue: z.number().int().min(1).max(3650).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RevenueEventInput = z.infer<typeof revenueEventSchema>;

export interface RevenueEventReceipt {
  accepted: boolean;
  duplicate: boolean;
  eventId: string;
  caseId: number;
  customerId: number;
}
