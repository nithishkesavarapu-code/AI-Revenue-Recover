import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ContactStatus, Prisma } from "@prisma/client";
import { Webhook } from "svix";
import { PrismaService } from "../../prisma/prisma.service";

type ResendPayload = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    tags?: Record<string, string>;
  };
};

const STATUS_BY_EVENT: Record<string, ContactStatus> = {
  "email.sent": ContactStatus.SENT,
  "email.delivered": ContactStatus.DELIVERED,
  "email.opened": ContactStatus.OPENED,
  "email.clicked": ContactStatus.CLICKED,
  "email.bounced": ContactStatus.BOUNCED,
  "email.failed": ContactStatus.FAILED,
  "email.received": ContactStatus.REPLIED,
};

@Injectable()
export class ResendWebhookService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async receive(rawBody: Buffer, headers: { id?: string; timestamp?: string; signature?: string }) {
    if (this.config.get("EMAIL_PROVIDER") !== "resend") {
      throw new BadRequestException("Resend webhooks are disabled while EMAIL_PROVIDER is not resend");
    }
    const secret = this.config.get<string>("RESEND_WEBHOOK_SECRET");
    if (!secret || !headers.id || !headers.timestamp || !headers.signature) {
      throw new UnauthorizedException("Missing Resend webhook verification details");
    }

    let payload: ResendPayload;
    try {
      payload = new Webhook(secret).verify(rawBody.toString("utf8"), {
        "svix-id": headers.id,
        "svix-timestamp": headers.timestamp,
        "svix-signature": headers.signature,
      }) as unknown as ResendPayload;
    } catch {
      throw new UnauthorizedException("Invalid Resend webhook signature");
    }

    const existing = await this.prisma.providerWebhookEvent.findUnique({
      where: { provider_eventId: { provider: "resend", eventId: headers.id } },
    });
    if (existing?.processedAt) return { accepted: true, duplicate: true };
    const event = existing ?? await this.prisma.providerWebhookEvent.create({
      data: { provider: "resend", eventId: headers.id, eventType: payload.type ?? "unknown", payload: payload as Prisma.InputJsonValue },
    });

    try {
      const status = STATUS_BY_EVENT[payload.type ?? ""];
      const attempt = status ? await this.findContactAttempt(payload) : null;
      if (attempt && status) {
        const nextStatus = this.shouldAdvance(attempt.status, status) ? status : attempt.status;
        await this.prisma.contactAttempt.update({ where: { id: attempt.id }, data: { status: nextStatus } });
        await this.prisma.caseEvent.create({
          data: {
            caseId: attempt.caseId,
            type: "EMAIL_STATUS_UPDATED",
            message: `Email ${payload.type?.replace("email.", "").replace(/_/g, " ") ?? "event"} for contact attempt #${attempt.id}`,
            metadata: { provider: "resend", providerMessageId: attempt.providerMessageId, status: nextStatus } as Prisma.InputJsonValue,
          },
        });
      }
      await this.prisma.providerWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), failure: null } });
      return { accepted: true, duplicate: false, tracked: Boolean(attempt) };
    } catch (error) {
      await this.prisma.providerWebhookEvent.update({
        where: { id: event.id },
        data: { failure: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
      });
      throw error;
    }
  }

  private async findContactAttempt(payload: ResendPayload) {
    const taggedId = Number(payload.data?.tags?.recovery_contact_attempt_id);
    if (Number.isInteger(taggedId) && taggedId > 0) {
      return this.prisma.contactAttempt.findUnique({ where: { id: taggedId } });
    }
    if (payload.type === "email.received") {
      const replyTo = payload.data?.to?.find((address) => /^replies\+\d+@/i.test(address));
      const id = Number(replyTo?.match(/^replies\+(\d+)@/i)?.[1]);
      return Number.isInteger(id) && id > 0 ? this.prisma.contactAttempt.findUnique({ where: { id } }) : null;
    }
    return payload.data?.email_id
      ? this.prisma.contactAttempt.findUnique({ where: { providerMessageId: payload.data.email_id } })
      : null;
  }

  private shouldAdvance(current: ContactStatus, next: ContactStatus) {
    if (current === ContactStatus.BOUNCED || current === ContactStatus.FAILED) return false;
    if (next === ContactStatus.BOUNCED || next === ContactStatus.FAILED) return true;
    const order = [ContactStatus.NOT_SENT, ContactStatus.SENT, ContactStatus.DELIVERED, ContactStatus.OPENED, ContactStatus.CLICKED, ContactStatus.REPLIED];
    return order.indexOf(next) >= order.indexOf(current);
  }
}
