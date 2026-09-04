import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CaseStatus, type Prisma } from "@prisma/client";
import type { VoiceCallResult, VoiceIntent } from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { PromisesService } from "./promises.service";

const SAMPLE_TRANSCRIPTS = [
  "Arre yaar, abhi balance nahi tha, kal payment kar dunga pakka.",
  "Link bhejo, main kal tak pura amount pay kar dunga.",
  "Main ne abhi pay kar diya hai, check kar lo.",
  "Parso tak dekh lungi, is baar zaroor hogi payment.",
  "Nahi nahi, main ab kuch nahi pay karunga.",
] as const;

const ACTIVE_STATUSES = [
  CaseStatus.OPEN,
  CaseStatus.DIAGNOSED,
  CaseStatus.ACTION_TAKEN,
  CaseStatus.WAITING_CUSTOMER,
] as const;

/**
 * Simulated Hinglish call understanding. A caller's statement never confirms
 * a payment: only a signed payment-provider webhook can recover a case.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promises: PromisesService,
  ) {}

  async simulateCall(caseId: number, transcript?: string): Promise<VoiceCallResult> {
    const recoveryCase = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, amountAtRisk: true },
    });
    if (!recoveryCase) throw new NotFoundException(`Recovery case ${caseId} not found`);
    if (!(ACTIVE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
      throw new BadRequestException(`Case #${caseId} is ${recoveryCase.status}; voice simulation only runs on active cases`);
    }

    const text = transcript?.trim() || this.pick(SAMPLE_TRANSCRIPTS);
    const { intent, when, amount } = this.parseIntent(recoveryCase.amountAtRisk, text);
    await this.recordVoiceEvent(caseId, intent, text);

    switch (intent) {
      case "PAYMENT_DONE":
        await this.recordPaymentClaim(caseId, text);
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: null,
          detail: "Payment claim recorded. The case remains open until a signed payment-provider webhook verifies it.",
          caseStatus: recoveryCase.status,
        };
      case "PROMISE_TO_PAY":
        await this.promises.recordPromise(caseId, amount, when, text);
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: when.toISOString(),
          detail: `Promise-to-pay recorded for Rs ${amount.toLocaleString("en-IN")} by ${when.toDateString().slice(4, 10)}. No outbound payment link is sent by a simulated call.`,
          caseStatus: CaseStatus.WAITING_CUSTOMER,
        };
      case "REFUSED":
        await this.escalateRefusal(caseId, text);
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: null,
          detail: "Customer refusal recorded; case escalated to human review.",
          caseStatus: CaseStatus.ESCALATED,
        };
      default:
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: null,
          detail: "Intent unclear. No outbound action was taken; route this case to a human operator.",
          caseStatus: recoveryCase.status,
        };
    }
  }

  private async recordVoiceEvent(caseId: number, intent: VoiceIntent, transcript: string) {
    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: "VOICE_CALL",
        message: `Simulated voice call completed; intent: ${intent.toLowerCase().replace(/_/g, " ")}.`,
        metadata: { intent, transcript } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "voice-agent",
        action: "VOICE_CALL_COMPLETED",
        entityType: "recovery_case",
        entityId: String(caseId),
        payload: { intent, transcript } as Prisma.InputJsonValue,
      },
    });
  }

  private async recordPaymentClaim(caseId: number, transcript: string) {
    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: "VOICE_PAYMENT_CLAIM",
        message: "Customer stated payment was completed; awaiting payment-provider verification.",
        metadata: { transcript } as Prisma.InputJsonValue,
      },
    });
  }

  private async escalateRefusal(caseId: number, transcript: string) {
    await this.prisma.$transaction([
      this.prisma.recoveryCase.update({ where: { id: caseId }, data: { status: CaseStatus.ESCALATED } }),
      this.prisma.caseEvent.create({
        data: {
          caseId,
          type: "ESCALATED",
          message: "Customer refused payment during simulated voice call; escalated to human review.",
          metadata: { transcript } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actor: "voice-agent",
          action: "VOICE_REFUSAL_ESCALATED",
          entityType: "recovery_case",
          entityId: String(caseId),
          payload: { transcript } as Prisma.InputJsonValue,
        },
      }),
    ]);
  }

  private parseIntent(amountAtRisk: Prisma.Decimal, text: string): { intent: VoiceIntent; when: Date; amount: number } {
    const normalized = text.toLowerCase();
    const amount = Number(amountAtRisk);
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

    if (/(kar diya|kar dia|ho gaya|bhej diya|already paid|paid already|done payment)/.test(normalized)) {
      return { intent: "PAYMENT_DONE", when: new Date(), amount };
    }
    if (/(nahi karunga|nahi dunga|nahi pay karunga|kabhi nahi|will not pay|never pay)/.test(normalized)) {
      return { intent: "REFUSED", when: new Date(), amount };
    }
    if (/(parso|day after tomorrow)/.test(normalized)) return { intent: "PROMISE_TO_PAY", when: inDays(2), amount };
    if (/(next week|agale hafte|hafte mein)/.test(normalized)) return { intent: "PROMISE_TO_PAY", when: inDays(7), amount };
    if (/(kal|tomorrow)/.test(normalized)) return { intent: "PROMISE_TO_PAY", when: inDays(1), amount };
    if (/(karunga|karungi|dunga|dungi|promise|vaada)/.test(normalized)) return { intent: "PROMISE_TO_PAY", when: inDays(3), amount };
    return { intent: "UNCLEAR", when: new Date(), amount };
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)] as T;
  }
}
