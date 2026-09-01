import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CaseStatus, PtpStatus, type Prisma } from "@prisma/client";
import {
  type VoiceCallResult,
  type VoiceIntent,
} from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { ToolsService } from "../tools/simulated-tools.service";
import { PromisesService } from "./promises.service";
import { VerificationService } from "../verification/verification.service";



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
 * Hinglish voice-recovery flow (guide §4.6):
 *   voice call -> simulated speech-to-text -> NLU intent detection
 *   -> route into the same bounded pipeline (verify / promise / escalate).
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolsService,
    private readonly verification: VerificationService,
    private readonly promises: PromisesService,
  ) {}


  async simulateCall(caseId: number, transcript?: string): Promise<VoiceCallResult> {
    const rc = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: { customer: { select: { name: true } } },
    });
    if (!rc) throw new NotFoundException(`Recovery case ${caseId} not found`);
    if (!(ACTIVE_STATUSES as readonly string[]).includes(rc.status)) {
      throw new BadRequestException(`Case #${caseId} is ${rc.status} — voice recovery only runs on active cases`);
    }

    const text = transcript?.trim() || this.pick(SAMPLE_TRANSCRIPTS);
    const { intent, when, amount } = this.parseIntent(rc.amountAtRisk, text);


    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: "VOICE_CALL",
        message: `Voice call completed — intent detected: ${intent.toLowerCase().replace(/_/g, " ")}. Transcript: "${text}"`,
        metadata: { intent, transcript: text } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "voice-agent",
        action: "VOICE_CALL_COMPLETED",
        entityType: "recovery_case",
        entityId: String(caseId),
        payload: { intent, transcript: text } as unknown as Prisma.InputJsonValue,
      },
    });

    switch (intent) {
      case "PAYMENT_DONE": {
        const r = await this.verification.simulateCustomer(caseId, "SUCCESS");
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: null,
          detail: `Customer confirmed payment on call — ${r.detail}`,
          caseStatus: r.caseStatus,
        };
      }
      case "PROMISE_TO_PAY": {
        const promise = await this.promises.recordPromise(caseId, amount, when, text);
        const link = await this.tools.sendPaymentLink(caseId, false);
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: when.toISOString(),
          detail: `Promise-to-pay recorded for ₹${amount.toLocaleString("en-IN")} by ${when.toDateString().slice(4, 10)} — ${link.detail}`,
          caseStatus: link.caseStatus,
        };
      }
      case "REFUSED": {
        const esc = await this.tools.escalate(caseId, "customer refused to pay on voice call");
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: null,
          detail: esc.detail,
          caseStatus: esc.caseStatus,
        };
      }
      default: {
        const link = await this.tools.sendPaymentLink(caseId, false);
        return {
          caseId,
          intent,
          transcript: text,
          promisedOn: null,
          detail: `Intent unclear — payment link sent as safe next step`,
          caseStatus: link.caseStatus,
        };
      }
    }
  }

  // ---------------- NLU (simulated STT + intent detection) ----------------

  /**
   * Keyword-based Hinglish intent detection — the seam where a real
   * speech-to-text + Gemini understanding pipeline plugs in later.
   */
  private parseIntent(amountAtRisk: Prisma.Decimal, text: string): { intent: VoiceIntent; when: Date; amount: number } {
    const t = text.toLowerCase();
    const amount = Number(amountAtRisk);
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

    if (/(kar diya|kar dia|ho gaya|bhej diya|already paid|paid already|done payment)/.test(t)) {
      return { intent: "PAYMENT_DONE", when: new Date(), amount };
    }
    if (/(nahi karunga|nahi dunga|nahi pay karunga|kabhi nahi|will not pay|never pay)/.test(t)) {
      return { intent: "REFUSED", when: new Date(), amount };
    }
    if (/(parso|day after tomorrow)/.test(t)) {
      return { intent: "PROMISE_TO_PAY", when: inDays(2), amount };
    }
    if (/(next week|agale hafte|hafte mein)/.test(t)) {
      return { intent: "PROMISE_TO_PAY", when: inDays(7), amount };
    }
    if (/(kal|tomorrow)/.test(t)) {
      return { intent: "PROMISE_TO_PAY", when: inDays(1), amount };
    }
    if (/(karunga|karungi|dunga|dungi|promise|vaada)/.test(t)) {
      return { intent: "PROMISE_TO_PAY", when: inDays(3), amount };
    }
    return { intent: "UNCLEAR", when: new Date(), amount };
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)] as T;
  }
}
