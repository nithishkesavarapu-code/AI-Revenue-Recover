import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CaseStatus, type Prisma } from "@prisma/client";
import {
  executeActionRequestSchema,
  type ExecuteActionResult,
  type PolicyDecision,
  type RecommendedAction,
} from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { PolicyEngineService } from "../policy/policy-engine.service";
import { ToolsService } from "../tools/simulated-tools.service";

const EXECUTABLE_CASE_STATUSES = [
  CaseStatus.OPEN,
  CaseStatus.DIAGNOSED,
  CaseStatus.ACTION_TAKEN,
  CaseStatus.WAITING_CUSTOMER,
] as const;

@Injectable()
export class CaseActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEngine: PolicyEngineService,
    private readonly tools: ToolsService,
  ) {}

  /**
   * The bounded execution loop:
   *   AI recommendation -> policy gate -> tool execution -> audit.
   * A DENY never silently drops the case; the bounded fallback is human escalation.
   */
  async execute(caseId: number, body: unknown): Promise<ExecuteActionResult> {
    const parsed = executeActionRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid request body",
        issues: parsed.error.flatten(),
      });
    }

    const rc = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: { aiDecision: true },
    });
    if (!rc) throw new NotFoundException(`Recovery case ${caseId} not found`);
    if (!(EXECUTABLE_CASE_STATUSES as readonly string[]).includes(rc.status)) {
      throw new BadRequestException(
        `Case #${caseId} is ${rc.status} and is no longer eligible for automated recovery actions`,
      );
    }

    const requested = parsed.data.action ?? rc.aiDecision?.recommendedAction ?? null;
    if (!requested) {
      throw new BadRequestException(
        "Case has no AI recommendation yet and no explicit action was provided; run POST /ai/diagnose first",
      );
    }

    const decision: PolicyDecision = await this.policyEngine.evaluateCase(caseId, requested);
    await this.recordPolicyVerdict(caseId, decision);

    const effective: RecommendedAction =
      decision.decision === "ALLOW" ? requested : decision.fallbackAction ?? "CREATE_ESCALATION";

    const toolResult = await this.runTool(caseId, effective, decision);

    return {
      caseId,
      policyDecision: decision,
      executedAction: effective,
      executed: true,
      detail: toolResult.detail,
      caseStatus: toolResult.caseStatus,
    };
  }

  /** Dry-run: verdict only, nothing executed. */
  async evaluateOnly(caseId: number, action?: RecommendedAction): Promise<PolicyDecision> {
    const rc = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      select: { id: true, aiDecision: { select: { recommendedAction: true } } },
    });
    if (!rc) throw new NotFoundException(`Recovery case ${caseId} not found`);
    const target = action ?? rc.aiDecision?.recommendedAction;
    if (!target) {
      throw new BadRequestException("No recommended action on this case; pass {action} explicitly");
    }
    return this.policyEngine.evaluateCase(caseId, target);
  }

  // ---------------- internals ----------------

  private async runTool(
    caseId: number,
    action: RecommendedAction,
    decision: PolicyDecision,
  ) {
    switch (action) {
      case "SEND_PAYMENT_LINK":
        return this.tools.sendPaymentLink(caseId, false);
      case "SEND_PAYMENT_UPDATE_LINK":
        return this.tools.sendPaymentLink(caseId, true);
      case "SEND_EMAIL":
        return this.tools.sendMessage(caseId, "EMAIL");
      case "SEND_SMS":
        return this.tools.sendMessage(caseId, "SMS");
      case "RETRY_PAYMENT":
        return this.tools.scheduleRetry(caseId, true);
      case "SCHEDULE_RETRY":
        return this.tools.scheduleRetry(caseId, false);
      case "CREATE_ESCALATION":
        return this.tools.escalate(
          caseId,
          decision.decision === "DENY"
            ? `policy denied ${decision.action} (${decision.reason})`
            : "AI recommended human review",
        );
      case "CLOSE_CASE":
        return this.tools.closeAsLost(caseId);
      case "NO_ACTION":
      default: {
        const status = (
          await this.prisma.recoveryCase.findUniqueOrThrow({
            where: { id: caseId },
            select: { status: true },
          })
        ).status;
        return {
          tool: action,
          detail: `No action taken; policy verdict recorded (${decision.reason})`,
          caseStatus: status as CaseStatus,
        };
      }
    }
  }

  private async recordPolicyVerdict(caseId: number, decision: PolicyDecision) {
    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: "POLICY_DECISION",
        message: `Policy ${decision.decision}: ${decision.action.replace(/_/g, " ").toLowerCase()} - ${decision.reason}`,
        metadata: {
          decision: decision.decision,
          action: decision.action,
          rules: decision.rules,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "policy-engine",
        action: `POLICY_${decision.decision}`,
        entityType: "recovery_case",
        entityId: String(caseId),
        payload: {
          requestedAction: decision.action,
          rules: decision.rules,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
