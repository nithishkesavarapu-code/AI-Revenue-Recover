import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async redactExpiredPii() {
    const days = Math.max(1, Number(process.env.PII_RETENTION_DAYS ?? 90));
    const before = new Date(Date.now() - days * 86_400_000);
    const promises = await this.prisma.promiseToPay.updateMany({ where: { transcript: { not: null }, createdAt: { lt: before } }, data: { transcript: "[redacted by retention policy]" } });
    const events = await this.prisma.caseEvent.findMany({ where: { type: { in: ["VOICE_CALL", "VOICE_PAYMENT_CLAIM", "ESCALATED"] }, createdAt: { lt: before }, metadata: { not: Prisma.JsonNull } } });
    for (const event of events) {
      const metadata = event.metadata as Record<string, unknown>;
      if ("transcript" in metadata) await this.prisma.caseEvent.update({ where: { id: event.id }, data: { metadata: { ...metadata, transcript: "[redacted by retention policy]" } } });
    }
    return { promisesRedacted: promises.count, eventsRedacted: events.length, retentionDays: days };
  }

  async dailySummary() {
    const since = new Date(Date.now() - 86_400_000);
    const [recovered, webhookFailures] = await Promise.all([
      this.prisma.recoveryCase.aggregate({ where: { status: "RECOVERED", closedAt: { gte: since } }, _count: true, _sum: { recoveredAmount: true } }),
      this.prisma.providerWebhookEvent.count({ where: { receivedAt: { gte: since }, failure: { not: null } } }),
    ]);
    const summary = { periodHours: 24, recoveredCases: recovered._count, recoveredAmount: Number(recovered._sum.recoveredAmount ?? 0), webhookFailures };
    this.logger.log(`DAILY_RECOVERY_SUMMARY ${JSON.stringify(summary)}`);
    if (webhookFailures) this.logger.error(`WEBHOOK_FAILURE_ALERT ${JSON.stringify(summary)}`);
    return summary;
  }
}
