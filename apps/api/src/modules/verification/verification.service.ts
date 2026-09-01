import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CaseStatus,
  FailureReason,
  InvoiceStatus,
  PaymentStatus,
  PtpStatus,
  SubscriptionStatus,
  type Prisma,
} from "@prisma/client";
import {
  type BatchVerificationResult,
  type CustomerOutcome,
  FAILURE_REASONS,
  type VerificationResult,
} from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";

/** Cases where we are waiting on money and may verify a payment event. */
const VERIFIABLE_STATUSES = [CaseStatus.WAITING_CUSTOMER, CaseStatus.ACTION_TAKEN] as const;

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cases currently awaiting a customer action / scheduled retry. */
  async pending(caseIdOnly = false) {
    const cases = await this.prisma.recoveryCase.findMany({
      where: { status: { in: [...VERIFIABLE_STATUSES] } },
      orderBy: { updatedAt: "asc" },
      select: caseIdOnly
        ? { id: true }
        : {
            id: true,
            type: true,
            amountAtRisk: true,
            status: true,
            updatedAt: true,
            customer: { select: { name: true } },
          },
    });
    return cases;
  }

  /**
   * Simulates the customer's response. SUCCESS is the payment-verification
   * event that unlocks recovered revenue; we never claim recovery without it.
   */
  async simulateCustomer(
    caseId: number,
    outcome: CustomerOutcome,
    failureReason?: string,
    providerReference?: string,
  ): Promise<VerificationResult> {
    return this.prisma.$transaction(async (tx) => {
      const rc = await tx.recoveryCase.findUnique({
        where: { id: caseId },
        include: {
          customer: { select: { name: true, email: true } },
          invoice: true,
          subscription: true,
          promise: true,
        },
      });
      if (!rc) throw new NotFoundException(`Recovery case ${caseId} not found`);
      if (!(VERIFIABLE_STATUSES as readonly string[]).includes(rc.status)) {
        throw new BadRequestException(
          `Case #${caseId} is ${rc.status}; only WAITING_CUSTOMER or ACTION_TAKEN cases can be verified`,
        );
      }

      const amount = Number(rc.amountAtRisk);
      const pendingPayment = await this.findPendingRetryPayment(tx, caseId, rc.customerId);

      if (outcome === "SUCCESS") {
        const reference = providerReference ?? pendingPayment?.reference ?? `pay_link_${caseId}_${Date.now().toString(36)}`;
        if (pendingPayment) {
          await tx.payment.update({
            where: { id: pendingPayment.id },
            data: { status: PaymentStatus.SUCCESS },
          });
        } else {
          await tx.payment.create({
            data: {
              customerId: rc.customerId,
              amount: rc.amountAtRisk,
              status: PaymentStatus.SUCCESS,
              reference,
            },
          });
        }

        await this.syncSourceRecordsOnRecovery(tx, rc);

        await tx.recoveryCase.update({
          where: { id: caseId },
          data: {
            status: CaseStatus.RECOVERED,
            recoveredAmount: rc.amountAtRisk,
            closedAt: new Date(),
          },
        });

        if (
          rc.promise &&
          (rc.promise.status === PtpStatus.RECORDED || rc.promise.status === PtpStatus.FOLLOWED_UP)
        ) {
          await tx.promiseToPay.update({
            where: { id: rc.promise.id },
            data: { status: PtpStatus.FULFILLED },
          });
          await this.addEvent(
            tx,
            caseId,
            "PROMISE_FULFILLED",
            "Promise to pay marked fulfilled after verified payment",
            { promiseId: rc.promise.id },
          );
        }

        await this.addEvent(
          tx,
          caseId,
          "PAYMENT_VERIFIED",
          `Customer completed payment; Rs ${amount.toLocaleString("en-IN")} received (ref ${reference})`,
          { reference, amount },
        );
        await this.addEvent(
          tx,
          caseId,
          "CLOSED",
          `Case closed as RECOVERED; Rs ${amount.toLocaleString("en-IN")} verified`,
          null,
        );
        await tx.auditLog.create({
          data: {
            actor: "verification-engine",
            action: "PAYMENT_VERIFIED_SUCCESS",
            entityType: "recovery_case",
            entityId: String(caseId),
            payload: { reference, amount } as unknown as Prisma.InputJsonValue,
          },
        });

        return {
          caseId,
          outcome: "SUCCESS",
          paymentReference: reference,
          recoveredAmount: amount,
          caseStatus: CaseStatus.RECOVERED,
          detail: `Rs ${amount.toLocaleString("en-IN")} recovered from ${rc.customer.name}; case closed as RECOVERED`,
        };
      }

      const normalizedReason = this.normalizeFailureReason(failureReason);
      if (pendingPayment) {
        await tx.payment.update({
          where: { id: pendingPayment.id },
          data: { status: PaymentStatus.FAILED, failureReason: normalizedReason },
        });
      }
      await this.addEvent(
        tx,
        caseId,
        "RETRY_FAILED",
        `Customer attempt failed (${normalizedReason.toLowerCase().replace(/_/g, " ")}); case remains active within policy limits`,
        { reason: normalizedReason },
      );
      await tx.auditLog.create({
        data: {
          actor: "verification-engine",
          action: "PAYMENT_ATTEMPT_FAILED",
          entityType: "recovery_case",
          entityId: String(caseId),
          payload: { reason: normalizedReason } as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        caseId,
        outcome: "FAILURE",
        paymentReference: pendingPayment?.reference ?? null,
        recoveredAmount: null,
        caseStatus: rc.status,
        detail: `Attempt failed (${normalizedReason.toLowerCase()}); case #${caseId} remains ${rc.status}`,
      };
    });
  }

  /** Settles recovery only after a verified provider webhook has been accepted. */
  async verifyProviderPayment(caseId: number, providerReference: string) {
    return this.simulateCustomer(caseId, "SUCCESS", undefined, providerReference);
  }

  /** Mass-simulate customer responses across every verifiable case. */
  async simulateBatch(successRatePct: number, limit: number): Promise<BatchVerificationResult> {
    const startedAt = Date.now();
    const pending = await this.prisma.recoveryCase.findMany({
      where: { status: { in: [...VERIFIABLE_STATUSES] } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });

    const result: BatchVerificationResult = {
      processed: 0,
      recoveredCount: 0,
      failedCount: 0,
      recoveredAmount: 0,
      skipped: 0,
      durationMs: 0,
    };

    for (const { id } of pending) {
      const roll = Math.random() * 100;
      const simulatedOutcome: CustomerOutcome = roll < successRatePct ? "SUCCESS" : "FAILURE";
      try {
        const verification = await this.simulateCustomer(id, simulatedOutcome);
        result.processed++;
        if (verification.outcome === "SUCCESS") {
          result.recoveredCount++;
          result.recoveredAmount += verification.recoveredAmount ?? 0;
        } else {
          result.failedCount++;
        }
      } catch {
        result.skipped++;
      }
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // ---------------- internals ----------------

  /** A retry tool created a payment marked RETRY_SCHEDULED; that is the pending attempt. */
  private findPendingRetryPayment(tx: Prisma.TransactionClient, caseId: number, customerId: number) {
    return tx.payment.findFirst({
      where: {
        customerId,
        status: PaymentStatus.RETRY_SCHEDULED,
        reference: { startsWith: `pay_retry_${caseId}_` },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async syncSourceRecordsOnRecovery(
    tx: Prisma.TransactionClient,
    rc: Awaited<ReturnType<VerificationService["loadVerifiableCase"]>>,
  ) {
    if (!rc) return;

    if (rc.invoice && rc.invoice.status !== InvoiceStatus.PAID) {
      await tx.invoice.update({
        where: { id: rc.invoice.id },
        data: { status: InvoiceStatus.PAID, paidAt: new Date() },
      });
    }

    if (rc.subscription && rc.subscription.status !== SubscriptionStatus.ACTIVE) {
      await tx.subscription.update({
        where: { id: rc.subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          renewalDate: this.nextRenewalDate(rc.subscription.renewalDate, rc.subscription.plan),
        },
      });
    }
  }

  private loadVerifiableCase(caseId: number) {
    return this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: {
        customer: { select: { name: true, email: true } },
        invoice: true,
        subscription: true,
        promise: true,
      },
    });
  }

  private async addEvent(
    tx: Prisma.TransactionClient,
    caseId: number,
    type: string,
    message: string,
    metadata: Record<string, unknown> | null,
  ) {
    await tx.caseEvent.create({
      data: {
        caseId,
        type,
        message,
        metadata: (metadata ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private nextRenewalDate(current: Date, plan: string) {
    const next = current.getTime() > Date.now() ? new Date(current) : new Date();
    if (/year/i.test(plan)) next.setFullYear(next.getFullYear() + 1);
    else next.setMonth(next.getMonth() + 1);
    return next;
  }

  private normalizeFailureReason(reason?: string): FailureReason {
    const upper = (reason ?? "INSUFFICIENT_FUNDS").trim().toUpperCase();
    return (FAILURE_REASONS as readonly string[]).includes(upper)
      ? (upper as FailureReason)
      : FailureReason.UNKNOWN;
  }
}
