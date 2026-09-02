import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type RecoveryMap = Map<string, number>;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async recovery() {
    const cases = await this.prisma.recoveryCase.findMany({
      include: { aiDecision: true, contactAttempts: true, events: true },
    });
    const maps = {
      byCause: new Map<string, number>(),
      byChannel: new Map<string, number>(),
      byAction: new Map<string, number>(),
      byDate: new Map<string, number>(),
    };
    let linksSent = 0;
    let linksRecovered = 0;
    let agent = 0;
    let agentRecovered = 0;
    let human = 0;
    let humanRecovered = 0;

    for (const item of cases) {
      const recovered = item.status === "RECOVERED";
      const amount = recovered ? Number(item.recoveredAmount ?? 0) : 0;
      this.add(maps.byCause, item.aiDecision?.rootCause ?? item.reason ?? "unknown", amount);
      this.add(maps.byAction, item.aiDecision?.recommendedAction ?? item.recommendedAction ?? "UNDECIDED", amount);
      this.add(maps.byDate, (item.closedAt ?? item.createdAt).toISOString().slice(0, 10), amount);
      for (const contact of item.contactAttempts) this.add(maps.byChannel, contact.channel, amount);

      const tools = item.events.map((event) => (event.metadata as { tool?: string } | null)?.tool);
      if (tools.includes("send_payment_link") || tools.includes("send_payment_update_link")) {
        linksSent++;
        if (recovered) linksRecovered++;
      }
      if (item.events.some((event) => event.type === "APPROVAL_APPROVED")) {
        human++;
        if (recovered) humanRecovered++;
      } else {
        agent++;
        if (recovered) agentRecovered++;
      }
    }

    return {
      ...Object.fromEntries(Object.entries(maps).map(([key, map]) => [key, this.rows(map)])),
      paymentLinkConversion: {
        linksSent,
        linksRecovered,
        ratePct: linksSent ? Math.round((linksRecovered / linksSent) * 1000) / 10 : 0,
      },
      recoveryOwnership: {
        agent: { cases: agent, recovered: agentRecovered },
        human: { cases: human, recovered: humanRecovered },
      },
    };
  }

  private add(map: RecoveryMap, key: string, amount: number) {
    map.set(key, (map.get(key) ?? 0) + amount);
  }

  private rows(map: RecoveryMap) {
    return [...map]
      .map(([key, recoveredAmount]) => ({ key, recoveredAmount }))
      .sort((a, b) => b.recoveredAmount - a.recoveredAmount);
  }
}
