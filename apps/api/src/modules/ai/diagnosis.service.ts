import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { CaseStatus, type Prisma } from "@prisma/client";
import {
  aiDecisionSchema,
  type AiDecision,
  type DiagnosisInput,
  type PendingDiagnosisResult,
} from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { AiDiagnosisProvider } from "./ai-provider.interface";

@Injectable()
export class DiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject("AI_PROVIDER") private readonly provider: AiDiagnosisProvider,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Diagnoses a single recovery case: gathers context, asks the provider for
   * a schema-valid decision, stores it and advances the case to DIAGNOSED.
   */
  async diagnoseCase(caseId: number, force = false) {
    const found = await this.loadCase(caseId);
    if (!found) throw new NotFoundException(`Recovery case ${caseId} not found`);
    if (found.aiDecision && !force) {
      return { caseId, status: found.status, skipped: true as const, decision: found.aiDecision };
    }

    const input = await this.buildInput(found);
    const decision = await this.provider.diagnose(input);
    // Hard guarantee: whatever the provider returns must satisfy the schema.
    const validated: AiDecision = aiDecisionSchema.parse(decision);

    const saved = await this.prisma.aiDecision.upsert({
      where: { caseId },
      create: this.decisionToCreate(caseId, validated, input),
      update: {
        classification: validated.classification,
        rootCause: validated.rootCause,
        recoverability: validated.recoverability,
        recommendedAction: validated.recommendedAction,
        confidence: validated.confidence,
        reason: validated.reason,
        provider: this.provider.name,
      },
    });

    // Never downgrade cases that already progressed past diagnosis.
    const canAdvance = found.status === CaseStatus.OPEN || found.status === CaseStatus.DIAGNOSED;

    const updated = await this.prisma.recoveryCase.update({
      where: { id: caseId },
      data: {
        status: canAdvance ? CaseStatus.DIAGNOSED : undefined,
        recommendedAction: validated.recommendedAction,
      },
    });

    const pct = Math.round(validated.confidence * 100);
    await this.prisma.caseEvent.create({
      data: {
        caseId,
        type: "DIAGNOSED",
        message: `AI [${this.provider.name}]: ${validated.recoverability.toLowerCase()} recoverability — recommends ${validated.recommendedAction.replace(/_/g, " ").toLowerCase()} (${pct}% confidence). ${validated.reason}`,
        metadata: {
          provider: this.provider.name,
          confidence: validated.confidence,
          action: validated.recommendedAction,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "ai-agent",
        action: "AI_DIAGNOSIS",
        entityType: "recovery_case",
        entityId: String(caseId),
        payload: {
          provider: this.provider.name,
          recoverability: validated.recoverability,
          recommendedAction: validated.recommendedAction,
          confidence: validated.confidence,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      caseId,
      status: updated.status,
      skipped: false as const,
      decision: saved,
    };
  }

  /** Diagnoses every OPEN case that has no AI decision yet (oldest first). */
  async diagnosePending(limit: number): Promise<PendingDiagnosisResult> {
    const startedAt = Date.now();
    const pending = await this.prisma.recoveryCase.findMany({
      where: { status: CaseStatus.OPEN, aiDecision: null },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });

    const result: PendingDiagnosisResult = {
      provider: this.provider.name,
      total: pending.length,
      diagnosed: 0,
      skippedExisting: 0,
      failed: [],
      durationMs: 0,
    };

    for (const { id } of pending) {
      try {
        const outcome = await this.diagnoseCase(id);
        if (outcome.skipped) result.skippedExisting++;
        else result.diagnosed++;
      } catch (err) {
        result.failed.push({
          caseId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // ---------------- helpers ----------------

  private loadCase(caseId: number) {
    return this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: {
        aiDecision: true,
        payment: true,
        invoice: true,
        subscription: true,
      },
    });
  }

  private async buildInput(
    rc: NonNullable<Awaited<ReturnType<DiagnosisService["loadCase"]>>>,
  ): Promise<DiagnosisInput> {
    const customerId = rc.customerId;
    const [successCount, failedCount, firstPayment] = await Promise.all([
      this.prisma.payment.count({ where: { customerId, status: "SUCCESS" } }),
      this.prisma.payment.count({ where: { customerId, status: "FAILED" } }),
      this.prisma.payment.findFirst({
        where: { customerId },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

    const tenureDays = firstPayment
      ? Math.max(0, Math.floor((Date.now() - firstPayment.createdAt.getTime()) / 86_400_000))
      : 0;

    const daysOverdue = rc.invoice?.dueDate
      ? Math.max(0, Math.floor((Date.now() - rc.invoice.dueDate.getTime()) / 86_400_000))
      : null;

    return {
      caseId: rc.id,
      caseType: rc.type,
      failureReason: rc.payment?.failureReason ?? null,
      previousAttempts: failedCount,
      successfulPayments: successCount,
      failedPayments: failedCount,
      amountAtRisk: Number(rc.amountAtRisk),
      currency: rc.currency,
      customerTenureDays: tenureDays,
      daysOverdue,
    };
  }

  private decisionToCreate(
    caseId: number,
    validated: AiDecision,
    input: DiagnosisInput,
  ): Prisma.AiDecisionCreateInput {
    return {
      case: { connect: { id: caseId } },
      classification: validated.classification,
      rootCause: validated.rootCause,
      recoverability: validated.recoverability,
      recommendedAction: validated.recommendedAction,
      confidence: validated.confidence,
      reason: validated.reason,
      provider: this.provider.name,
      model: this.provider.name === "gemini" ? (this.geminiModel() ?? null) : "simulated-reasoning-v1",
      rawOutput: {
        input,
        decision: validated,
      } as unknown as Prisma.InputJsonValue,
    };
  }

  private geminiModel(): string | undefined {
    return this.providerName === "gemini" ? process.env.GEMINI_MODEL ?? "gemini-2.0-flash" : undefined;
  }
}

