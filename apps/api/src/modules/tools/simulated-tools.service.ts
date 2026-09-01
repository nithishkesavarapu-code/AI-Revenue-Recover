import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CaseStatus, PaymentStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RazorpayService } from "../payments/razorpay.service";

export interface ToolResult {
  tool: string;
  detail: string;
  caseStatus: CaseStatus;
  contactAttemptId?: number;
  paymentId?: number;
}

/** Statuses that may still receive automated recovery work. */
const ACTIONABLE_STATUSES = [
  CaseStatus.OPEN,
  CaseStatus.DIAGNOSED,
  CaseStatus.ACTION_TAKEN,
  CaseStatus.WAITING_CUSTOMER,
] as const;

/**
 * Simulated execution tools (guide Sec. 8 "Payment / Email / Escalation APIs").
 * Every call writes an ACTION_EXECUTED timeline event + audit-log entry so
 * nothing happens off the record. Real providers (Razorpay/Resend/Twilio)
 * will implement the same contracts later.
 */
@Injectable()
export class ToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly config: ConfigService,
  ) {}

  async sendPaymentLink(caseId: number, updateMethod: boolean): Promise<ToolResult> {
    const rc = await this.loadCase(caseId, true);
    const liveLink = this.razorpay.isEnabled()
      ? await this.razorpay.createPaymentLink({
          caseId,
          amount: Number(rc.amountAtRisk),
          currency: rc.currency,
          customerName: rc.customer.name,
          email: rc.customer.email,
          phone: rc.customer.phone,
          updateMethod,
        })
      : null;
    const link = liveLink?.short_url ?? `https://pay.revrec.sim/l/${caseId}-${Date.now().toString(36)}`;
    const kind = updateMethod ? "Payment-method update link" : "Secure payment link";
    const deliveryEnabled = liveLink && this.config.get("RECOVERY_SEND_LIVE_MESSAGES") === "true";
    const attempt = await this.prisma.contactAttempt.create({
      data: {
        caseId,
        channel: "EMAIL",
        status: deliveryEnabled ? "SENT" : "NOT_SENT",
        content: `${kind}: ${link} (amount at risk Rs ${Number(rc.amountAtRisk).toLocaleString("en-IN")})`,
      },
    });
    return this.finish(caseId, {
      tool: updateMethod ? "send_payment_update_link" : "send_payment_link",
      detail: `${kind} ${liveLink ? "created with Razorpay" : "created in simulation"}${deliveryEnabled ? ` and sent to ${rc.customer.email}` : "; customer delivery is disabled"}: ${link}`,
      caseStatus: CaseStatus.WAITING_CUSTOMER,
      contactAttemptId: attempt.id,
    });
  }

  async sendMessage(caseId: number, channel: "EMAIL" | "SMS"): Promise<ToolResult> {
    const rc = await this.loadCase(caseId, true);
    const template =
      channel === "EMAIL"
        ? `Gentle reminder from ${rc.customer.company ?? "our billing team"}: your pending payment of Rs ${Number(rc.amountAtRisk).toLocaleString("en-IN")} can be completed in one click.`
        : `Reminder: Rs ${Number(rc.amountAtRisk).toLocaleString("en-IN")} pending. Tap to pay: https://pay.revrec.sim/s/${caseId}`;
    const attempt = await this.prisma.contactAttempt.create({
      data: { caseId, channel, status: "NOT_SENT", content: template },
    });
    return this.finish(caseId, {
      tool: channel === "EMAIL" ? "send_email" : "send_sms",
      detail: `${channel === "EMAIL" ? "Recovery email" : "Recovery SMS"} recorded but not delivered because no messaging provider is configured for case #${caseId}`,
      caseStatus: CaseStatus.WAITING_CUSTOMER,
      contactAttemptId: attempt.id,
    });
  }

  async scheduleRetry(caseId: number, immediate: boolean): Promise<ToolResult> {
    const rc = await this.loadCase(caseId, true);
    const existing = await this.prisma.payment.count({ where: { customerId: rc.customerId } });
    const payment = await this.prisma.payment.create({
      data: {
        customerId: rc.customerId,
        amount: rc.amountAtRisk,
        status: PaymentStatus.RETRY_SCHEDULED,
        reference: `pay_retry_${caseId}_${existing + 1}`,
      },
    });
    return this.finish(caseId, {
      tool: immediate ? "retry_payment" : "schedule_retry",
      detail: `${immediate ? "Immediate retry" : "Retry"} scheduled for Rs ${Number(rc.amountAtRisk).toLocaleString("en-IN")} (payment ref ${payment.reference}) and is awaiting verification`,
      caseStatus: CaseStatus.ACTION_TAKEN,
      paymentId: payment.id,
    });
  }

  async escalate(caseId: number, reason: string): Promise<ToolResult> {
    await this.loadCase(caseId, true);
    return this.finish(
      caseId,
      {
        tool: "create_escalation",
        detail: `Case escalated to human review: ${reason}`,
        caseStatus: CaseStatus.ESCALATED,
      },
      true,
    );
  }

  async closeAsLost(caseId: number): Promise<ToolResult> {
    await this.loadCase(caseId, true);
    return this.finish(caseId, {
      tool: "close_case",
      detail: "Case closed without recovery",
      caseStatus: CaseStatus.CLOSED_LOST,
    });
  }

  // ---------------- internals ----------------

  private async loadCase(caseId: number, requireActionable = false) {
    const rc = await this.prisma.recoveryCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { customer: true },
    });
    if (requireActionable && !(ACTIONABLE_STATUSES as readonly string[]).includes(rc.status)) {
      throw new BadRequestException(
        `Case #${caseId} is ${rc.status} and can no longer receive automated recovery actions`,
      );
    }
    return rc;
  }

  /**
   * Persists the tool outcome: advances the case (only from actionable states,
   * never downgrades RECOVERED/ESCALATED/CLOSED), writes the timeline event
   * and the audit-log entry.
   */
  private async finish(
    caseId: number,
    result: ToolResult & { caseStatus: CaseStatus },
    forceStatus = false,
  ): Promise<ToolResult> {
    const rc = await this.loadCase(caseId);
    const mayAdvance =
      forceStatus || (ACTIONABLE_STATUSES as readonly string[]).includes(rc.status);

    await this.prisma.recoveryCase.update({
      where: { id: caseId },
      data: {
        status: mayAdvance ? result.caseStatus : undefined,
        closedAt:
          result.caseStatus === CaseStatus.CLOSED_LOST || result.caseStatus === CaseStatus.ESCALATED
            ? new Date()
            : undefined,
      },
    });

    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: "ACTION_EXECUTED",
        message: `${result.tool.replace(/_/g, " ")} - ${result.detail}`,
        metadata: {
          tool: result.tool,
          contactAttemptId: result.contactAttemptId ?? null,
          paymentId: result.paymentId ?? null,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "recovery-agent",
        action: `TOOL_${result.tool.toUpperCase()}`,
        entityType: "recovery_case",
        entityId: String(caseId),
        payload: { detail: result.detail } as unknown as Prisma.InputJsonValue,
      },
    });

    return { ...result, caseStatus: mayAdvance ? result.caseStatus : rc.status };
  }
}
