import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { StatsSummary } from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";

const CASE_STATUSES_EXCLUDED_FROM_ACTIVE = ["RECOVERED", "CLOSED_LOST"] as const;

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(options: { take?: number; status?: string; type?: string }) {
    const where: Prisma.RecoveryCaseWhereInput = {};
    if (options.status) where.status = options.status as never;
    if (options.type) where.type = options.type as never;

    return this.prisma.recoveryCase.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(Math.max(options.take ?? 100, 1), 500),
      include: {
        customer: {
          select: { id: true, name: true, company: true, email: true },
        },
        aiDecision: {
          select: {
            rootCause: true,
            recoverability: true,
            recommendedAction: true,
            confidence: true,
          },
        },
      },
    });
  }

  async get(id: number) {
    const found = await this.prisma.recoveryCase.findUnique({
      where: { id },
      include: {
        customer: true,
        aiDecision: true,
        events: { orderBy: { createdAt: "asc" } },
        contactAttempts: { orderBy: { sentAt: "desc" } },
      },
    });
    if (!found) throw new NotFoundException(`Recovery case ${id} not found`);
    return found;
  }

  /**
   * Dashboard KPIs (guide §16–17):
   * - totalAtRisk   : sum of amountAtRisk across all non-recovered cases
   * - totalRecovered: sum of verified recoveredAmount (only RECOVERED cases count)
   * - recoveryRate  : recovered / (recovered + still at risk)
   */
  async statsSummary(): Promise<StatsSummary> {
    const [atRiskAgg, recoveredAgg, statusGroups, activeTypeGroups, recoveredTypeGroups] = await Promise.all([
      this.prisma.recoveryCase.aggregate({
        where: { status: { notIn: [...CASE_STATUSES_EXCLUDED_FROM_ACTIVE] } },
        _sum: { amountAtRisk: true },
      }),
      this.prisma.recoveryCase.aggregate({
        where: { status: "RECOVERED" },
        _sum: { recoveredAmount: true },
        _count: true,
      }),
      this.prisma.recoveryCase.groupBy({
        by: ["status"],
        _count: true,
      }),
      this.prisma.recoveryCase.groupBy({
        by: ["type"],
        where: { status: { notIn: [...CASE_STATUSES_EXCLUDED_FROM_ACTIVE] } },
        _count: true,
        _sum: { amountAtRisk: true },
      }),
      this.prisma.recoveryCase.groupBy({
        by: ["type"],
        where: { status: "RECOVERED" },
        _count: true,
        _sum: { recoveredAmount: true },
      }),
    ]);

    const toNum = (d: Prisma.Decimal | null | undefined) => Number(d ?? 0);

    const totalAtRisk = toNum(atRiskAgg._sum.amountAtRisk);
    const totalRecovered = toNum(recoveredAgg._sum.recoveredAmount);
    const recoveredCases = recoveredAgg._count;
    const totalCases = statusGroups.reduce((acc, g) => acc + g._count, 0);

    const countOf = (...statuses: string[]) =>
      statusGroups.filter((g) => statuses.includes(g.status)).reduce((acc, g) => acc + g._count, 0);

    const activeCases = countOf("OPEN", "DIAGNOSED", "ACTION_TAKEN", "WAITING_CUSTOMER");
    const waitingCustomer = countOf("WAITING_CUSTOMER");
    const humanReview = countOf("ESCALATED");
    const activeByType = new Map(
      activeTypeGroups.map((group) => [group.type, group] as const),
    );
    const recoveredByType = new Map(
      recoveredTypeGroups.map((group) => [group.type, group] as const),
    );
    const allTypes = new Set([
      ...activeByType.keys(),
      ...recoveredByType.keys(),
    ]);

    const denominator = totalAtRisk + totalRecovered;
    return {
      totalAtRisk,
      totalRecovered,
      recoveryRatePct: denominator > 0 ? Math.round((totalRecovered / denominator) * 1000) / 10 : 0,
      totalCases,
      activeCases,
      waitingCustomer,
      humanReview,
      recoveredCases,
      byType: [...allTypes].map((type) => ({
        type,
        cases: (activeByType.get(type)?._count ?? 0) + (recoveredByType.get(type)?._count ?? 0),
        atRisk: toNum(activeByType.get(type)?._sum.amountAtRisk),
        recovered: toNum(recoveredByType.get(type)?._sum.recoveredAmount),
      })),
    };
  }

  /**
   * Recovery-strategy comparison (guide §18): how each executed strategy
   * (the AI's recommended action) performs across all cases.
   */
  async strategies() {
    const [all, recovered] = await Promise.all([
      this.prisma.recoveryCase.groupBy({
        by: ["recommendedAction"],
        where: { recommendedAction: { not: null } },
        _count: true,
        _sum: { amountAtRisk: true, recoveredAmount: true },
      }),
      this.prisma.recoveryCase.groupBy({
        by: ["recommendedAction"],
        where: { status: "RECOVERED" },
        _count: true,
        _sum: { amountAtRisk: true, recoveredAmount: true },
      }),
    ]);

    const toNum = (d: Prisma.Decimal | null | undefined) => Number(d ?? 0);
    const recoveredByAction = new Map(
      recovered.map((g) => [g.recommendedAction, g] as const),
    );

    return all
      .map((g) => {
        const rec = g.recommendedAction ? recoveredByAction.get(g.recommendedAction) : undefined;
        const cases = g._count;
        const recoveredCount = rec?._count ?? 0;
        const atRisk = toNum(g._sum.amountAtRisk);
        const recoveredAmt = toNum(g._sum.recoveredAmount);
        return {
          action: g.recommendedAction,
          cases,
          recoveredCases: recoveredCount,
          recoveryRatePct: cases > 0 ? Math.round((recoveredCount / cases) * 1000) / 10 : 0,
          amountAtRisk: atRisk,
          recoveredAmount: recoveredAmt,
        };
      })
      .sort((a, b) => b.cases - a.cases);
  }
}
