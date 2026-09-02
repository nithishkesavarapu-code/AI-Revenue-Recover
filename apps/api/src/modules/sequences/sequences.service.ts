import { Injectable, NotFoundException } from "@nestjs/common";
import { CaseStatus, PtpStatus, type Prisma } from "@prisma/client";
import {
  DEFAULT_RECOVERY_SEQUENCE,
  recoverySequenceConfigSchema,
  type RecoverySequenceResult,
  type RecoverySequenceStep,
} from "@revrec/shared";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { CaseActionsService } from "../cases/cases-actions.service";

const ACTIVE_STATUSES = [
  CaseStatus.OPEN,
  CaseStatus.DIAGNOSED,
  CaseStatus.ACTION_TAKEN,
  CaseStatus.WAITING_CUSTOMER,
] as const;

const TOOL_BY_ACTION: Record<string, string> = {
  SEND_PAYMENT_LINK: "send_payment_link",
  SEND_PAYMENT_UPDATE_LINK: "send_payment_update_link",
  SEND_EMAIL: "send_email",
  SEND_SMS: "send_sms",
  RETRY_PAYMENT: "retry_payment",
  SCHEDULE_RETRY: "schedule_retry",
  CREATE_ESCALATION: "create_escalation",
  CLOSE_CASE: "close_case",
  NO_ACTION: "no_action",
};

@Injectable()
export class SequencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly actions: CaseActionsService,
  ) {}

  getSteps(): RecoverySequenceStep[] {
    const raw = this.config.get<string>("RECOVERY_SEQUENCE_STEPS_JSON");
    if (!raw) return DEFAULT_RECOVERY_SEQUENCE;
    try {
      const parsed = recoverySequenceConfigSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : DEFAULT_RECOVERY_SEQUENCE;
    } catch {
      return DEFAULT_RECOVERY_SEQUENCE;
    }
  }

  async runCase(caseId: number): Promise<RecoverySequenceResult> {
    const recoveryCase = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: {
        promise: true,
        events: { where: { type: "ACTION_EXECUTED" }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!recoveryCase) throw new NotFoundException(`Recovery case ${caseId} not found`);

    if (!(ACTIVE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
      return this.result(recoveryCase, "STOPPED", null, null, `Case is ${recoveryCase.status}; sequence cannot continue`);
    }
    if (
      recoveryCase.promise &&
      (recoveryCase.promise.status === PtpStatus.RECORDED ||
        recoveryCase.promise.status === PtpStatus.FOLLOWED_UP) &&
      recoveryCase.promise.promisedOn > new Date()
    ) {
      return this.result(
        recoveryCase,
        "PAUSED",
        null,
        recoveryCase.promise.promisedOn,
        "Sequence paused while the customer promise-to-pay is still active",
      );
    }

    const steps = this.getSteps();
    const completedAt = this.completedStepTimes(recoveryCase.events, steps);
    const nextIndex = completedAt.length;
    const step = steps[nextIndex] ?? null;
    if (!step) return this.result(recoveryCase, "COMPLETE", null, null, "All sequence steps have already run");

    const anchor = completedAt.at(-1) ?? recoveryCase.createdAt;
    const dueAt = new Date(anchor.getTime() + step.waitHours * 3_600_000);
    if (dueAt > new Date()) {
      return this.result(recoveryCase, "WAITING", step, dueAt, `Next step is due after ${step.waitHours} hour(s)`);
    }

    const execution = await this.actions.execute(caseId, { action: step.action });
    if (execution.executedAction !== step.action) {
      if (execution.executedAction === "NO_ACTION") {
        const retryAt = new Date(Date.now() + 3_600_000);
        await this.recordSequenceEvent(caseId, "SEQUENCE_DEFERRED", `Sequence step '${step.label}' deferred by policy`, {
          requestedAction: step.action,
          retryAt: retryAt.toISOString(),
          policyReason: execution.policyDecision.reason,
        });
        return {
          caseId,
          state: "WAITING",
          step,
          dueAt: retryAt.toISOString(),
          detail: execution.policyDecision.reason,
          caseStatus: execution.caseStatus ?? recoveryCase.status,
        };
      }
      await this.recordSequenceEvent(caseId, "SEQUENCE_BLOCKED", `Sequence step '${step.label}' was stopped by policy`, {
        requestedAction: step.action,
        executedAction: execution.executedAction,
        policyReason: execution.policyDecision.reason,
      });
      return {
        caseId,
        state: "STOPPED",
        step,
        dueAt: dueAt.toISOString(),
        detail: execution.detail ?? execution.policyDecision.reason,
        caseStatus: execution.caseStatus ?? recoveryCase.status,
      };
    }

    await this.recordSequenceEvent(caseId, "SEQUENCE_STEP_EXECUTED", `Sequence step '${step.label}' executed`, {
      action: step.action,
      waitHours: step.waitHours,
    });
    return {
      caseId,
      state: "EXECUTED",
      step,
      dueAt: dueAt.toISOString(),
      detail: execution.detail ?? `Executed ${step.action}`,
      caseStatus: execution.caseStatus ?? recoveryCase.status,
    };
  }

  async sweep(limit: number) {
    const cases = await this.prisma.recoveryCase.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    const results: RecoverySequenceResult[] = [];
    for (const recoveryCase of cases) results.push(await this.runCase(recoveryCase.id));
    return {
      checked: cases.length,
      executed: results.filter((result) => result.state === "EXECUTED").length,
      waiting: results.filter((result) => result.state === "WAITING" || result.state === "PAUSED").length,
      stopped: results.filter((result) => result.state === "STOPPED").length,
      results,
    };
  }

  private completedStepTimes(events: Array<{ createdAt: Date; metadata: Prisma.JsonValue | null }>, steps: RecoverySequenceStep[]) {
    const completed: Date[] = [];
    for (const event of events) {
      const expected = steps[completed.length];
      if (!expected) break;
      const metadata = event.metadata as { tool?: string } | null;
      if (metadata?.tool === TOOL_BY_ACTION[expected.action]) completed.push(event.createdAt);
    }
    return completed;
  }

  private async recordSequenceEvent(caseId: number, type: string, message: string, payload: Record<string, unknown>) {
    await this.prisma.caseEvent.create({
      data: { caseId, type, message, metadata: payload as Prisma.InputJsonValue },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "recovery-sequence",
        action: type,
        entityType: "recovery_case",
        entityId: String(caseId),
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private result(
    recoveryCase: { id: number; status: CaseStatus },
    state: RecoverySequenceResult["state"],
    step: RecoverySequenceStep | null,
    dueAt: Date | null,
    detail: string,
  ): RecoverySequenceResult {
    return { caseId: recoveryCase.id, state, step, dueAt: dueAt?.toISOString() ?? null, detail, caseStatus: recoveryCase.status };
  }
}
