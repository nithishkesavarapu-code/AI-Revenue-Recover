import { Injectable } from "@nestjs/common";
import {
  CaseType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Priority,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import type { RevenueEventInput, RevenueEventReceipt } from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async receive(input: RevenueEventInput): Promise<RevenueEventReceipt> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.revenueEvent.create({
          data: {
            provider: input.provider,
            eventId: input.eventId,
            eventType: input.type,
            payload: input as unknown as Prisma.InputJsonValue,
            occurredAt: input.occurredAt ?? new Date(),
          },
        });
        const customer = await tx.customer.upsert({
          where: { email: input.customer.email.toLowerCase() },
          create: {
            name: input.customer.name,
            email: input.customer.email.toLowerCase(),
            phone: input.customer.phone,
            company: input.customer.company,
          },
          update: {
            name: input.customer.name,
            phone: input.customer.phone,
            company: input.customer.company,
          },
        });

        const recoveryCase = await this.createCase(tx, customer.id, input);
        await tx.revenueEvent.update({
          where: { id: event.id },
          data: { caseId: recoveryCase.id, processedAt: new Date() },
        });

        return {
          accepted: true,
          duplicate: false,
          eventId: input.eventId,
          caseId: recoveryCase.id,
          customerId: customer.id,
        };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existing = await this.prisma.revenueEvent.findUnique({
        where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
      });
      if (!existing?.caseId) throw error;
      const recoveryCase = await this.prisma.recoveryCase.findUniqueOrThrow({
        where: { id: existing.caseId },
        select: { customerId: true },
      });
      return {
        accepted: true,
        duplicate: true,
        eventId: input.eventId,
        caseId: existing.caseId,
        customerId: recoveryCase.customerId,
      };
    }
  }

  private async createCase(tx: Prisma.TransactionClient, customerId: number, input: RevenueEventInput) {
    const sourceReference = input.sourceReference ?? `${input.provider}:${input.eventId}`;
    const type = this.caseTypeFor(input.type);
    const source = await this.createSourceRecord(tx, customerId, input, sourceReference);
    const message = this.detectedMessage(input, sourceReference);
    const recoveryCase = await tx.recoveryCase.create({
      data: {
        customerId,
        type,
        amountAtRisk: input.amount,
        currency: input.currency,
        reason: message,
        priority: this.priorityFor(input.amount),
        sourcePaymentId: source.paymentId,
        sourceSubscriptionId: source.subscriptionId,
        sourceInvoiceId: source.invoiceId,
      },
    });
    await tx.caseEvent.create({
      data: {
        caseId: recoveryCase.id,
        type: "DETECTED",
        message,
        metadata: {
          provider: input.provider,
          eventId: input.eventId,
          sourceReference,
          ...input.metadata,
        } as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        actor: `provider:${input.provider}`,
        action: "REVENUE_EVENT_INGESTED",
        entityType: "recovery_case",
        entityId: String(recoveryCase.id),
        payload: { eventId: input.eventId, eventType: input.type, amount: input.amount } as Prisma.InputJsonValue,
      },
    });
    return recoveryCase;
  }

  private async createSourceRecord(
    tx: Prisma.TransactionClient,
    customerId: number,
    input: RevenueEventInput,
    sourceReference: string,
  ) {
    if (input.type === "PAYMENT_FAILED") {
      const payment = await tx.payment.create({
        data: {
          customerId,
          amount: input.amount,
          currency: input.currency,
          status: PaymentStatus.FAILED,
          failureReason: input.failureReason ?? "UNKNOWN",
          paymentMethod: input.paymentMethod ?? PaymentMethod.CARD,
          reference: sourceReference,
        },
      });
      return { paymentId: payment.id };
    }
    if (input.type === "SUBSCRIPTION_PAYMENT_FAILED") {
      const subscription = await tx.subscription.create({
        data: {
          customerId,
          amount: input.amount,
          currency: input.currency,
          plan: "external",
          renewalDate: input.occurredAt ?? new Date(),
          status: SubscriptionStatus.PAST_DUE,
        },
      });
      return { subscriptionId: subscription.id };
    }
    if (input.type === "INVOICE_OVERDUE") {
      const invoice = await tx.invoice.create({
        data: {
          customerId,
          number: sourceReference,
          amount: input.amount,
          currency: input.currency,
          dueDate: new Date(Date.now() - (input.daysOverdue ?? 1) * 86_400_000),
          status: InvoiceStatus.OVERDUE,
        },
      });
      return { invoiceId: invoice.id };
    }
    return {};
  }

  private caseTypeFor(type: RevenueEventInput["type"]) {
    const types: Record<RevenueEventInput["type"], CaseType> = {
      PAYMENT_FAILED: CaseType.FAILED_PAYMENT,
      SUBSCRIPTION_PAYMENT_FAILED: CaseType.FAILED_SUBSCRIPTION,
      INVOICE_OVERDUE: CaseType.OVERDUE_INVOICE,
      CHECKOUT_ABANDONED: CaseType.CHECKOUT_ABANDONMENT,
    };
    return types[type];
  }

  private detectedMessage(input: RevenueEventInput, sourceReference: string) {
    const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: input.currency }).format(input.amount);
    const descriptions: Record<RevenueEventInput["type"], string> = {
      PAYMENT_FAILED: `Payment ${sourceReference} failed`,
      SUBSCRIPTION_PAYMENT_FAILED: `Subscription payment ${sourceReference} failed`,
      INVOICE_OVERDUE: `Invoice ${sourceReference} is ${input.daysOverdue ?? 1} day(s) overdue`,
      CHECKOUT_ABANDONED: `Checkout ${sourceReference} was abandoned`,
    };
    return `${descriptions[input.type]} for ${input.customer.name}; ${amount} at risk`;
  }

  private priorityFor(amount: number): Priority {
    if (amount >= 200_000) return Priority.CRITICAL;
    if (amount >= 50_000) return Priority.HIGH;
    if (amount >= 10_000) return Priority.MEDIUM;
    return Priority.LOW;
  }
}
