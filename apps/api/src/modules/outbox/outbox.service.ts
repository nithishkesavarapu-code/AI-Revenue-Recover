import { Injectable, Logger } from "@nestjs/common";
import { OutboxStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ResendEmailService } from "../email/resend-email.service";

type RecoveryEmailPayload = Parameters<ResendEmailService["sendRecoveryEmail"]>[0];

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService, private readonly resend: ResendEmailService) {}

  async enqueueEmail(payload: RecoveryEmailPayload) {
    const dedupeKey = `recovery-email:${payload.contactAttemptId}`;
    const message = await this.prisma.outboxMessage.upsert({
      where: { dedupeKey },
      create: { topic: "RECOVERY_EMAIL", dedupeKey, payload: payload as unknown as Prisma.InputJsonValue },
      update: {},
    });
    return this.dispatch(message.id);
  }

  async drain(limit = 25) {
    const messages = await this.prisma.outboxMessage.findMany({
      where: { status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] }, attempts: { lt: 5 }, availableAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" }, take: limit,
    });
    const results = await Promise.all(messages.map((message) => this.dispatch(message.id)));
    return { processed: results.length, sent: results.filter((result) => result.delivered).length };
  }

  private async dispatch(id: number) {
    const claimed = await this.prisma.outboxMessage.updateMany({
      where: { id, status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] }, attempts: { lt: 5 }, availableAt: { lte: new Date() } },
      data: { status: OutboxStatus.PROCESSING, attempts: { increment: 1 } },
    });
    if (!claimed.count) return { delivered: false, skipped: true };
    const message = await this.prisma.outboxMessage.findUniqueOrThrow({ where: { id } });
    try {
      const payload = message.payload as unknown as RecoveryEmailPayload;
      const delivery = await this.resend.sendRecoveryEmail(payload);
      await this.prisma.$transaction([
        this.prisma.contactAttempt.update({ where: { id: payload.contactAttemptId }, data: { status: "SENT", provider: delivery.provider, providerMessageId: delivery.providerMessageId } }),
        this.prisma.outboxMessage.update({ where: { id }, data: { status: OutboxStatus.SENT, sentAt: new Date(), lastError: null } }),
      ]);
      return { delivered: true };
    } catch (error) {
      const text = error instanceof Error ? error.message : "Provider delivery failed";
      const retryAt = new Date(Date.now() + Math.min(60 * 60_000, 60_000 * 2 ** message.attempts));
      await this.prisma.outboxMessage.update({ where: { id }, data: { status: OutboxStatus.FAILED, availableAt: retryAt, lastError: text.slice(0, 500) } });
      this.logger.error(`Outbox message #${id} failed: ${text}`);
      return { delivered: false, error: text };
    }
  }
}
