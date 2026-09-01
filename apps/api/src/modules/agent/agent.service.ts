import { Injectable } from "@nestjs/common";
import { CaseStatus, PtpStatus, type Prisma } from "@prisma/client";
import {
  batchRecoveryRunRequestSchema,
  type BatchRecoveryCaseOutcome,
  type BatchRecoveryFailure,
  type BatchRecoveryRunRequest,
  type BatchRecoveryRunResult,
  type BatchSimulationResult,
  type CustomerOutcome,
  type RecommendedAction,
} from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { DiagnosisService } from "../ai/diagnosis.service";
import { CaseActionsService } from "../cases/cases-actions.service";
import { CasesService } from "../cases/cases.service";
import { PromisesService } from "../promises/promises.service";
import { SimulatorService } from "../simulator/simulator.service";
import { VerificationService } from "../verification/verification.service";

const OPEN_PROMISE_STATUSES = [PtpStatus.RECORDED, PtpStatus.FOLLOWED_UP] as const;

type FailureStep = BatchRecoveryFailure["step"];

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diagnosis: DiagnosisService,
    private readonly caseActions: CaseActionsService,
    private readonly cases: CasesService,
    private readonly promises: PromisesService,
    private readonly simulator: SimulatorService,
    private readonly verification: VerificationService,
  ) {}

  async runBatch(body: unknown): Promise<BatchRecoveryRunResult> {
    const input = batchRecoveryRunRequestSchema.parse(body ?? {});
    const startedAt = new Date();

    const simulated = await this.maybeSimulateBatch(input);
    const snapshots = await this.prisma.recoveryCase.findMany({
      where: {
        status: { in: input.statuses as CaseStatus[] },
      },
      orderBy: [
        { priority: "desc" },
        { amountAtRisk: "desc" },
        { createdAt: "asc" },
      ],
      take: input.limit,
      select: {
        id: true,
        type: true,
        priority: true,
        status: true,
        aiDecision: { select: { recommendedAction: true } },
        promise: { select: { status: true, promisedOn: true } },
      },
    });

    const result: BatchRecoveryRunResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      durationMs: 0,
      selectedCases: snapshots.length,
      simulatedCases: simulated?.totalCases ?? 0,
      simulated,
      diagnosedCases: 0,
      executedCases: 0,
      policyAllowed: 0,
      policyDenied: 0,
      waitingForCustomer: 0,
      recoveredCount: 0,
      recoveredAmount: 0,
      escalatedCount: 0,
      skippedCount: 0,
      actionBreakdown: [],
      failures: [],
      outcomes: [],
      promiseSweep: null,
      summaryAfterRun: await this.cases.statsSummary(),
    };

    const actionCounts = new Map<RecommendedAction, number>();

    for (const snapshot of snapshots) {
      const outcome: BatchRecoveryCaseOutcome = {
        caseId: snapshot.id,
        type: snapshot.type,
        priority: snapshot.priority,
        startedStatus: snapshot.status,
        endedStatus: snapshot.status,
        diagnosed: false,
        requestedAction: snapshot.aiDecision?.recommendedAction ?? null,
        executedAction: null,
        policyDecision: null,
        recoveredAmount: null,
        note: "",
      };

      let stage: FailureStep = "diagnose";
      let liveStatus = snapshot.status;
      let action = snapshot.aiDecision?.recommendedAction ?? null;

      try {
        if (!action && this.isPreActionStatus(liveStatus)) {
          const diagnosis = await this.diagnosis.diagnoseCase(snapshot.id);
          if (!diagnosis.skipped) {
            result.diagnosedCases++;
            outcome.diagnosed = true;
          }
          liveStatus = diagnosis.status as CaseStatus;
          action = diagnosis.decision.recommendedAction;
          outcome.requestedAction = action;
          outcome.note = this.appendNote(outcome.note, `Diagnosed by ${diagnosis.decision.provider}`);
        }

        if (action && this.isPreActionStatus(liveStatus)) {
          stage = "execute";
          const execution = await this.caseActions.execute(snapshot.id, { action });
          result.executedCases++;
          outcome.executedAction = execution.executedAction;
          outcome.policyDecision = execution.policyDecision.decision;
          liveStatus = execution.caseStatus as CaseStatus;
          outcome.note = this.appendNote(outcome.note, execution.detail ?? "Action executed");

          if (execution.policyDecision.decision === "ALLOW") result.policyAllowed++;
          else result.policyDenied++;

          if (execution.executedAction) {
            actionCounts.set(
              execution.executedAction,
              (actionCounts.get(execution.executedAction) ?? 0) + 1,
            );
          }
          if (liveStatus === CaseStatus.ESCALATED) {
            result.escalatedCount++;
          }
        }

        if (input.verifyWaitingCustomers && this.isWaitingForOutcomeStatus(liveStatus)) {
          const fresh = await this.prisma.recoveryCase.findUnique({
            where: { id: snapshot.id },
            select: {
              status: true,
              promise: { select: { status: true, promisedOn: true } },
            },
          });
          if (!fresh) {
            throw new Error(`Recovery case ${snapshot.id} disappeared during the run`);
          }

          liveStatus = fresh.status as CaseStatus;
          if (
            fresh.promise &&
            (OPEN_PROMISE_STATUSES as readonly string[]).includes(fresh.promise.status) &&
            fresh.promise.promisedOn.getTime() > Date.now()
          ) {
            result.waitingForCustomer++;
            result.skippedCount++;
            outcome.note = this.appendNote(
              outcome.note,
              `Awaiting promised payment date ${fresh.promise.promisedOn.toISOString()}`,
            );
          } else {
            stage = "verify";
            const customerOutcome: CustomerOutcome =
              Math.random() * 100 < input.verificationSuccessRatePct ? "SUCCESS" : "FAILURE";
            const verification = await this.verification.simulateCustomer(snapshot.id, customerOutcome);
            liveStatus = verification.caseStatus as CaseStatus;
            outcome.recoveredAmount = verification.recoveredAmount;
            outcome.note = this.appendNote(outcome.note, verification.detail);

            if (verification.outcome === "SUCCESS") {
              result.recoveredCount++;
              result.recoveredAmount += verification.recoveredAmount ?? 0;
            } else {
              result.waitingForCustomer++;
            }
          }
        } else if (this.isWaitingForOutcomeStatus(liveStatus)) {
          result.waitingForCustomer++;
          result.skippedCount++;
          outcome.note = this.appendNote(outcome.note, "Waiting for a real customer outcome");
        }
      } catch (error) {
        result.skippedCount++;
        result.failures.push({
          caseId: snapshot.id,
          step: stage,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 200),
        });
        outcome.note = this.appendNote(
          outcome.note,
          `Stopped at ${stage}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      outcome.endedStatus = liveStatus;
      result.outcomes.push(outcome);
    }

    if (input.runPromiseSweep) {
      result.promiseSweep = await this.promises.sweep();
    }

    result.actionBreakdown = [...actionCounts.entries()].map(([action, count]) => ({ action, count }));
    result.summaryAfterRun = await this.cases.statsSummary();
    result.finishedAt = new Date().toISOString();
    result.durationMs = new Date(result.finishedAt).getTime() - startedAt.getTime();

    await this.prisma.auditLog.create({
      data: {
        actor: "recovery-agent",
        action: "BATCH_WORKFLOW_RUN",
        entityType: "recovery_batch",
        entityId: startedAt.toISOString(),
        payload: {
          input,
          selectedCases: result.selectedCases,
          diagnosedCases: result.diagnosedCases,
          executedCases: result.executedCases,
          recoveredCount: result.recoveredCount,
          recoveredAmount: result.recoveredAmount,
          promiseSweep: result.promiseSweep,
          failures: result.failures,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return result;
  }

  private async maybeSimulateBatch(input: BatchRecoveryRunRequest): Promise<BatchSimulationResult | null> {
    if (!input.simulateBatch) return null;
    const total =
      (input.simulateBatch.failedPayments ?? 0) +
      (input.simulateBatch.checkoutAbandonments ?? 0) +
      (input.simulateBatch.subscriptionFailures ?? 0) +
      (input.simulateBatch.invoiceOverdues ?? 0);
    if (total === 0) return null;
    return this.simulator.runBatch(input.simulateBatch);
  }

  private appendNote(current: string, next: string) {
    return current ? `${current} ${next}` : next;
  }

  private isPreActionStatus(status: CaseStatus) {
    return status === CaseStatus.OPEN || status === CaseStatus.DIAGNOSED;
  }

  private isWaitingForOutcomeStatus(status: CaseStatus) {
    return status === CaseStatus.WAITING_CUSTOMER || status === CaseStatus.ACTION_TAKEN;
  }
}
