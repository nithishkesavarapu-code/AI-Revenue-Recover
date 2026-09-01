import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CaseStatus, PtpStatus, type Prisma } from "@prisma/client";
import type { PtpSweepResult } from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { CaseActionsService } from "../cases/cases-actions.service";
import { VerificationService } from "../verification/verification.service";

const ACTIVE_PROMISE_CASE_STATUSES = [
  CaseStatus.OPEN,
  CaseStatus.DIAGNOSED,
  CaseStatus.ACTION_TAKEN,
  CaseStatus.WAITING_CUSTOMER,
] as const;

const OPEN_PROMISE_STATUSES = [PtpStatus.RECORDED, PtpStatus.FOLLOWED_UP] as const;

@Injectable()
export class PromisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseActions: CaseActionsService,
    private readonly verification: VerificationService,
  ) {}

  /** Records (or refreshes) a promise-to-pay for a case. */
  async recordPromise(caseId: number, amount: number, promisedOn: Date, transcript: string | null) {
    const rc = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, amountAtRisk: true },
    });
    if (!rc) throw new NotFoundException(`Recovery case ${caseId} not found`);
    if (!(ACTIVE_PROMISE_CASE_STATUSES as readonly string[]).includes(rc.status)) {
      throw new BadRequestException(`Case #${caseId} is ${rc.status} and cannot accept a new promise to pay`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Promise amount must be greater than 0");
    }

    const caseAmount = Number(rc.amountAtRisk);
    if (amount > caseAmount) {
      throw new BadRequestException(`Promise amount ${amount} exceeds case amount at risk ${caseAmount}`);
    }
    if (promisedOn.getTime() < Date.now() - 300_000) {
      throw new BadRequestException("Promised date must be in the future");
    }

    const existing = await this.prisma.promiseToPay.findUnique({ where: { caseId } });
    const promise = existing
      ? await this.prisma.promiseToPay.update({
          where: { id: existing.id },
          data: { amount, promisedOn, transcript, status: PtpStatus.RECORDED, followUps: 0 },
        })
      : await this.prisma.promiseToPay.create({
          data: {
            caseId,
            amount,
            promisedOn,
            source: "VOICE",
            transcript,
          },
        });

    await this.prisma.recoveryCase.update({
      where: { id: caseId },
      data: {
        status: rc.status === CaseStatus.WAITING_CUSTOMER ? undefined : CaseStatus.WAITING_CUSTOMER,
      },
    });

    await this.logPromiseStatus(
      promise.id,
      caseId,
      existing ? "PROMISE_UPDATED" : "PROMISE_RECORDED",
      existing
        ? `Promise to pay refreshed for Rs ${amount.toLocaleString("en-IN")} by ${promisedOn.toISOString()}`
        : `Promise to pay recorded for Rs ${amount.toLocaleString("en-IN")} by ${promisedOn.toISOString()}`,
      {
        status: PtpStatus.RECORDED,
        promisedOn: promisedOn.toISOString(),
        amount,
        transcript,
      },
    );

    return promise;
  }

  list() {
    return this.prisma.promiseToPay
      .findMany({
        orderBy: { promisedOn: "asc" },
        include: {
          case: {
            select: {
              id: true,
              type: true,
              status: true,
              customer: { select: { name: true, company: true } },
            },
          },
        },
      })
      .then((rows) =>
        rows.map((p) => ({
          id: p.id,
          caseId: p.caseId,
          amount: p.amount,
          currency: p.currency,
          promisedOn: p.promisedOn.toISOString(),
          status: p.status,
          source: p.source,
          transcript: p.transcript,
          followUps: p.followUps,
          createdAt: p.createdAt.toISOString(),
          caseInfo: {
            id: p.case.id,
            type: p.case.type,
            status: p.case.status,
            customerName: p.case.customer.name,
            company: p.case.customer.company,
          },
        })),
      );
  }

  /**
   * Sweep promises past their date with no verified payment yet:
   * first miss -> one permitted reminder through the policy engine;
   * still unpaid after one follow-up -> human escalation.
   */
  async sweep(): Promise<PtpSweepResult> {
    const due = await this.prisma.promiseToPay.findMany({
      where: {
        promisedOn: { lte: new Date() },
        status: { in: [...OPEN_PROMISE_STATUSES] },
      },
      include: {
        case: {
          select: { id: true, status: true, closedAt: true },
        },
      },
      orderBy: { promisedOn: "asc" },
      take: 50,
    });

    const result: PtpSweepResult = {
      dueChecked: due.length,
      remindersSent: 0,
      deferred: 0,
      escalations: 0,
      errors: [],
    };

    for (const promise of due) {
      try {
        if (promise.case.status === CaseStatus.RECOVERED) {
          await this.markPromise(promise.id, promise.caseId, PtpStatus.FULFILLED, "Promise marked fulfilled because the case is already recovered");
          continue;
        }
        if (promise.case.status === CaseStatus.ESCALATED || promise.case.status === CaseStatus.CLOSED_LOST) {
          await this.markPromise(promise.id, promise.caseId, PtpStatus.BROKEN, `Promise closed because the case is already ${promise.case.status.toLowerCase()}`);
          continue;
        }

        if (promise.followUps === 0) {
          const exec = await this.caseActions.execute(promise.caseId, { action: "SEND_EMAIL" });
          if (exec.executedAction === "SEND_EMAIL") {
            result.remindersSent++;
            await this.prisma.promiseToPay.update({
              where: { id: promise.id },
              data: { status: PtpStatus.FOLLOWED_UP, followUps: { increment: 1 } },
            });
            await this.logPromiseStatus(
              promise.id,
              promise.caseId,
              "PROMISE_FOLLOWED_UP",
              "Promise missed; one compliant reminder sent",
              { status: PtpStatus.FOLLOWED_UP },
            );
          } else {
            if (exec.executedAction === "NO_ACTION") {
              result.deferred++;
              await this.logPromiseStatus(
                promise.id,
                promise.caseId,
                "PROMISE_DEFERRED",
                "Promise follow-up deferred until the next compliant contact window",
                { status: promise.status, deferredByPolicy: true },
              );
            } else {
              result.escalations++;
              await this.markPromise(
                promise.id,
                promise.caseId,
                PtpStatus.BROKEN,
                `Promise missed and reminder was blocked by policy; fallback action ${exec.executedAction ?? "CREATE_ESCALATION"} executed`,
              );
            }
          }
          continue;
        }

        const exec = await this.caseActions.execute(promise.caseId, { action: "CREATE_ESCALATION" });
        if (exec.executedAction === "CREATE_ESCALATION") {
          result.escalations++;
        }
        await this.markPromise(
          promise.id,
          promise.caseId,
          PtpStatus.BROKEN,
          "Promise missed after one follow-up; case escalated to human review",
        );
      } catch (err) {
        result.errors.push({
          caseId: promise.caseId,
          error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
        });
      }
    }

    return result;
  }

  /** Manual settlement of a tracked promise. */
  async settle(id: number, outcome: "SUCCESS" | "FAILURE") {
    const promise = await this.prisma.promiseToPay.findUnique({
      where: { id },
      include: { case: { select: { id: true, status: true } } },
    });
    if (!promise) throw new NotFoundException(`Promise ${id} not found`);
    if (promise.status === PtpStatus.FULFILLED || promise.status === PtpStatus.BROKEN) {
      throw new BadRequestException(`Promise already settled (${promise.status})`);
    }

    if (outcome === "SUCCESS") {
      await this.markPromise(id, promise.caseId, PtpStatus.FULFILLED, "Promise manually settled as kept");
      if (promise.case.status === CaseStatus.RECOVERED) {
        return {
          promiseId: id,
          outcome,
          detail: `Promise fulfilled and case #${promise.caseId} was already recovered`,
          caseStatus: promise.case.status,
        };
      }
      const verification = await this.verification.simulateCustomer(promise.caseId, "SUCCESS");
      return { promiseId: id, outcome, detail: verification.detail, caseStatus: verification.caseStatus };
    }

    await this.markPromise(id, promise.caseId, PtpStatus.BROKEN, "Promise manually settled as broken");
    const exec = await this.caseActions.execute(promise.caseId, { action: "CREATE_ESCALATION" });
    return {
      promiseId: id,
      outcome,
      detail: `Promise broken; ${exec.detail ?? `case #${promise.caseId} escalated to human review`}`,
      caseStatus: exec.caseStatus,
    };
  }

  // ---------------- internals ----------------

  private async markPromise(id: number, caseId: number, status: PtpStatus, message: string) {
    await this.prisma.promiseToPay.update({ where: { id }, data: { status } });
    await this.logPromiseStatus(id, caseId, `PROMISE_${status}`, message, { status });
  }

  private async logPromiseStatus(
    promiseId: number,
    caseId: number,
    action: string,
    message: string,
    payload: Record<string, unknown>,
  ) {
    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: action,
        message,
        metadata: { promiseId, ...payload } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "recovery-agent",
        action,
        entityType: "promise_to_pay",
        entityId: String(promiseId),
        payload: { caseId, ...payload } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
