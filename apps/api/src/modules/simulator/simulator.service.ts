import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CaseType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Priority,
  SubscriptionStatus,
  type Prisma,
} from "@prisma/client";
import {
  PAYMENT_FAILURE_REASONS,
  type BatchSimulationInput,
  type CheckoutAbandonmentEventInput,
  type InvoiceOverdueEventInput,
  type PaymentFailureEventInput,
  type SubscriptionFailureEventInput,
} from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Ishaan", "Kabir", "Rohan", "Nikhil", "Amit",
  "Suresh", "Devansh", "Diya", "Aisha", "Neha", "Pooja", "Shreya", "Tanvi",
  "Riya", "Meera", "Kavya", "Isha",
] as const;

const LAST_NAMES = [
  "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Gupta", "Singh",
  "Kulkarni", "Deshpande", "Joshi", "Kapoor", "Bhatt", "Menon", "Chopra",
] as const;

const COMPANIES = [
  "Sunrise Traders", "NovaTech Solutions", "BlueOrchid Retail", "Zenith Logistics",
  "PrimeWave Media", "Silverline Foods", "Quantum Fabrics", "Orbit Electricals",
] as const;

const PAYMENT_AMOUNTS = [499, 999, 1499, 1999, 2499, 4999, 9999] as const;
const SUBSCRIPTION_AMOUNTS = [999, 1499, 1999, 2499, 2999, 36000] as const;
const PAYMENT_METHODS = ["CARD", "UPI", "NETBANKING"] as const;

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

@Injectable()
export class SimulatorService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- event simulations ----------------

  async simulatePaymentFailure(input: PaymentFailureEventInput) {
    const customer = await this.resolveCustomer(input.customerId);
    const amount = input.amount ?? this.pick(PAYMENT_AMOUNTS);
    const failureReason = input.failureReason ?? this.pick(PAYMENT_FAILURE_REASONS);

    const payment = await this.prisma.payment.create({
      data: {
        customerId: customer.id,
        amount,
        status: PaymentStatus.FAILED,
        failureReason,
        paymentMethod: this.pick(PAYMENT_METHODS),
        reference: `pay_sim_${Date.now()}_${this.randomInt(100, 999)}`,
      },
    });

    const recoveryCase = await this.openCase({
      customerId: customer.id,
      type: CaseType.FAILED_PAYMENT,
      amountAtRisk: amount,
      reason: `Payment of ${inr(amount)} failed (${failureReason.toLowerCase()})`,
      sourcePaymentId: payment.id,
      detectedMessage: `Failed payment of ${inr(amount)} for ${customer.name} — reason: ${failureReason.toLowerCase().replace(/_/g, " ")}`,
      metadata: { paymentId: payment.id, failureReason },
    });

    return { caseId: recoveryCase.id, paymentId: payment.id, customerId: customer.id };
  }

  async simulateCheckoutAbandonment(input: CheckoutAbandonmentEventInput) {
    const customer = await this.resolveCustomer(input.customerId);
    const cartValue = input.cartValue ?? this.randomInt(20, 1200) * 100;

    const recoveryCase = await this.openCase({
      customerId: customer.id,
      type: CaseType.CHECKOUT_ABANDONMENT,
      amountAtRisk: cartValue,
      reason: `Cart worth ${inr(cartValue)} abandoned at the payment step`,
      detectedMessage: `Checkout abandoned by ${customer.name} — cart value ${inr(cartValue)}`,
      metadata: { cartValue },
    });

    return { caseId: recoveryCase.id, customerId: customer.id };
  }

  async simulateSubscriptionFailure(input: SubscriptionFailureEventInput) {
    const customer = await this.resolveCustomer(input.customerId);
    const amount = input.amount ?? this.pick(SUBSCRIPTION_AMOUNTS);
    const plan = amount >= 10_000 ? "yearly" : "monthly";

    const subscription = await this.prisma.subscription.create({
      data: {
        customerId: customer.id,
        plan,
        amount,
        renewalDate: this.daysAgo(this.randomInt(1, 7)),
        status: SubscriptionStatus.PAST_DUE,
      },
    });

    const recoveryCase = await this.openCase({
      customerId: customer.id,
      type: CaseType.FAILED_SUBSCRIPTION,
      amountAtRisk: amount,
      reason: `${plan === "yearly" ? "Yearly" : "Monthly"} renewal of ${inr(amount)} failed`,
      sourceSubscriptionId: subscription.id,
      detectedMessage: `Subscription renewal of ${inr(amount)} failed for ${customer.name} (${plan} plan)`,
      metadata: { subscriptionId: subscription.id, plan, amount },
    });

    return { caseId: recoveryCase.id, subscriptionId: subscription.id, customerId: customer.id };
  }

  async simulateInvoiceOverdue(input: InvoiceOverdueEventInput) {
    const customer = await this.resolveCustomer(input.customerId);
    const amount = input.amount ?? this.randomInt(50, 800) * 1000;
    const daysOverdue = input.daysOverdue ?? this.randomInt(3, 45);
    const seq = (await this.prisma.invoice.count()) + 2001;
    const number = `INV-${seq}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        customerId: customer.id,
        number,
        amount,
        dueDate: this.daysAgo(daysOverdue),
        status: InvoiceStatus.OVERDUE,
        createdAt: this.daysAgo(daysOverdue + 15),
      },
    });

    const recoveryCase = await this.openCase({
      customerId: customer.id,
      type: CaseType.OVERDUE_INVOICE,
      amountAtRisk: amount,
      reason: `Invoice ${number} (${inr(amount)}) is ${daysOverdue} days overdue`,
      sourceInvoiceId: invoice.id,
      detectedMessage: `Invoice ${number} for ${inr(amount)} is ${daysOverdue} days overdue (${customer.name})`,
      metadata: { invoiceId: invoice.id, number, daysOverdue },
    });

    return { caseId: recoveryCase.id, invoiceId: invoice.id, customerId: customer.id };
  }

  async runBatch(input: BatchSimulationInput) {
    const startedAt = Date.now();
    const plan = {
      failedPayments: input.failedPayments ?? 25,
      checkoutAbandonments: input.checkoutAbandonments ?? 12,
      subscriptionFailures: input.subscriptionFailures ?? 8,
      invoiceOverdues: input.invoiceOverdues ?? 5,
    };

    const caseIds = {
      failedPayments: [] as number[],
      checkoutAbandonments: [] as number[],
      subscriptionFailures: [] as number[],
      invoiceOverdues: [] as number[],
    };

    for (let i = 0; i < plan.failedPayments; i++) {
      const r = await this.simulatePaymentFailure({});
      caseIds.failedPayments.push(r.caseId);
    }
    for (let i = 0; i < plan.checkoutAbandonments; i++) {
      const r = await this.simulateCheckoutAbandonment({});
      caseIds.checkoutAbandonments.push(r.caseId);
    }
    for (let i = 0; i < plan.subscriptionFailures; i++) {
      const r = await this.simulateSubscriptionFailure({});
      caseIds.subscriptionFailures.push(r.caseId);
    }
    for (let i = 0; i < plan.invoiceOverdues; i++) {
      const r = await this.simulateInvoiceOverdue({});
      caseIds.invoiceOverdues.push(r.caseId);
    }

    return {
      createdCounts: {
        failedPayments: caseIds.failedPayments.length,
        checkoutAbandonments: caseIds.checkoutAbandonments.length,
        subscriptionFailures: caseIds.subscriptionFailures.length,
        invoiceOverdues: caseIds.invoiceOverdues.length,
      },
      totalCases:
        caseIds.failedPayments.length +
        caseIds.checkoutAbandonments.length +
        caseIds.subscriptionFailures.length +
        caseIds.invoiceOverdues.length,
      caseIds,
      durationMs: Date.now() - startedAt,
    };
  }

  // ---------------- helpers ----------------

  /** Resolves the target customer: explicit id, random existing, or a fresh synthetic one. */
  private async resolveCustomer(customerId?: number) {
    if (customerId) {
      const found = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!found) throw new NotFoundException(`Customer ${customerId} not found`);
      return found;
    }
    const total = await this.prisma.customer.count();
    if (total > 0 && Math.random() < 0.6) {
      const skip = this.randomInt(0, total - 1);
      const [existing] = await this.prisma.customer.findMany({ skip, take: 1 });
      if (existing) return existing;
    }
    return this.createSyntheticCustomer();
  }

  private async createSyntheticCustomer() {
    const first = this.pick(FIRST_NAMES);
    const last = this.pick(LAST_NAMES);
    const isBusiness = Math.random() < 0.35;
    const suffix = this.randomInt(1000, 9999);

    return this.prisma.customer.create({
      data: {
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${suffix}@example.com`,
        phone: `+91 ${this.randomInt(70, 99)}${this.randomInt(10, 99)} ${this.randomInt(10000, 99999)}`,
        company: isBusiness ? this.pick(COMPANIES) : null,
        riskScore: Math.round(Math.random() * 60) / 100,
      },
    });
  }

  private async openCase(input: {
    customerId: number;
    type: CaseType;
    amountAtRisk: number;
    reason: string;
    sourcePaymentId?: number;
    sourceSubscriptionId?: number;
    sourceInvoiceId?: number;
    detectedMessage: string;
    metadata?: Record<string, unknown>;
  }) {
    const recoveryCase = await this.prisma.recoveryCase.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        amountAtRisk: input.amountAtRisk,
        reason: input.reason,
        status: "OPEN",
        priority: this.priorityFor(input.amountAtRisk),
        sourcePaymentId: input.sourcePaymentId,
        sourceSubscriptionId: input.sourceSubscriptionId,
        sourceInvoiceId: input.sourceInvoiceId,
      },
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId: recoveryCase.id,
        type: "DETECTED",
        message: input.detectedMessage,
        metadata:
          input.metadata as unknown as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actor: "system",
        action: "SIMULATE_EVENT",
        entityType: "recovery_case",
        entityId: String(recoveryCase.id),
        payload: {
          eventType: input.type,
          amountAtRisk: input.amountAtRisk,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return recoveryCase;
  }

  /** Bigger amounts at risk -> higher priority. */
  private priorityFor(amount: number): Priority {
    if (amount >= 200_000) return Priority.CRITICAL;
    if (amount >= 50_000) return Priority.HIGH;
    if (amount >= 10_000) return Priority.MEDIUM;
    return Priority.LOW;
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)] as T;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private daysAgo(n: number): Date {
    return new Date(Date.now() - n * 86_400_000);
  }
}

