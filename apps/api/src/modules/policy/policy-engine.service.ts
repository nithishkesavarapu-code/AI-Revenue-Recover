import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  COLLECTION_EXEMPT_ACTIONS,
  CONTACT_ACTIONS,
  DEFAULT_POLICY_CONFIG,
  RETRY_ACTIONS,
  type PolicyConfig,
  type PolicyDecision,
  type PolicyRuleResult,
  type RecommendedAction,
} from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";

const ALWAYS_ALLOWED = new Set<string>(COLLECTION_EXEMPT_ACTIONS);
const RETRY_TOOL_NAMES = ["retry_payment", "schedule_retry"];

interface EvaluationContext {
  action: RecommendedAction;
  retryCount: number;
  contactCount: number;
  hoursSinceLastContact: number | null;
  disputed: boolean;
  failureReason: string | null;
}

@Injectable()
export class PolicyEngineService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  /** Effective config = code defaults overridden by env. */
  getConfig(): PolicyConfig {
    const num = (key: string, fallback: number) => {
      const value = Number(this.config.get<string>(key));
      return Number.isFinite(value) && value >= 0 ? value : fallback;
    };

    return {
      maxRetryAttemptsPerCase: num("MAX_RETRY_ATTEMPTS_PER_CASE", DEFAULT_POLICY_CONFIG.maxRetryAttemptsPerCase),
      maxContactAttemptsPerCase: num("MAX_CONTACT_ATTEMPTS_PER_CASE", DEFAULT_POLICY_CONFIG.maxContactAttemptsPerCase),
      minHoursBetweenContacts: num("MIN_HOURS_BETWEEN_CONTACTS", DEFAULT_POLICY_CONFIG.minHoursBetweenContacts),
      contactWindowStartHourIST: this.hourFromEnv(
        "CONTACT_WINDOW_START_IST",
        DEFAULT_POLICY_CONFIG.contactWindowStartHourIST,
        23,
      ),
      contactWindowEndHourIST: this.hourFromEnv(
        "CONTACT_WINDOW_END_IST",
        DEFAULT_POLICY_CONFIG.contactWindowEndHourIST,
        24,
      ),
      retryableFailureReasons: [...DEFAULT_POLICY_CONFIG.retryableFailureReasons],
    };
  }

  /** Evaluates the case's stored AI recommendation, or an explicit override. */
  async evaluateWithOverride(
    caseId: number,
    override?: RecommendedAction,
  ): Promise<PolicyDecision> {
    if (override) return this.evaluateCase(caseId, override);

    const rc = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      select: { aiDecision: { select: { recommendedAction: true } } },
    });
    if (!rc) throw new NotFoundException(`Recovery case ${caseId} not found`);
    const stored = rc.aiDecision?.recommendedAction;
    if (!stored) {
      throw new BadRequestException("Case has no AI recommendation; run POST /ai/diagnose first or pass {action}");
    }
    return this.evaluateCase(caseId, stored);
  }

  /**
   * Full evaluation for a case: loads live context (attempt counts,
   * contact history, dispute flags) then applies the rule set.
   */
  async evaluateCase(caseId: number, action: RecommendedAction): Promise<PolicyDecision> {
    const rc = await this.prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: {
        invoice: true,
        payment: true,
        contactAttempts: { orderBy: { sentAt: "desc" } },
        events: { where: { type: "ACTION_EXECUTED" } },
      },
    });
    if (!rc) throw new NotFoundException(`Recovery case ${caseId} not found`);

    let retryCount = 0;
    for (const event of rc.events) {
      const meta = event.metadata as { tool?: string } | null;
      if (meta && RETRY_TOOL_NAMES.includes(meta.tool ?? "")) retryCount++;
    }

    const lastContactAt = rc.contactAttempts[0]?.sentAt ?? null;

    let payment = rc.payment;
    if (!payment && (rc.type === "FAILED_PAYMENT" || rc.type === "MANDATE_FAILURE")) {
      payment = await this.prisma.payment.findFirst({
        where: { customerId: rc.customerId, status: "FAILED" },
        orderBy: { createdAt: "desc" },
      });
    }

    return this.evaluate({
      action,
      retryCount,
      contactCount: rc.contactAttempts.length,
      hoursSinceLastContact: lastContactAt
        ? Math.round(((Date.now() - lastContactAt.getTime()) / 3_600_000) * 10) / 10
        : null,
      disputed: rc.invoice?.status === "DISPUTED",
      failureReason: payment?.failureReason ?? null,
    });
  }

  /** Pure rule evaluation; deterministic and unit-testable. */
  evaluate(ctx: EvaluationContext): PolicyDecision {
    const cfg = this.getConfig();
    const rules: PolicyRuleResult[] = [];
    const isRetry = (RETRY_ACTIONS as readonly string[]).includes(ctx.action);
    const isContact = (CONTACT_ACTIONS as readonly string[]).includes(ctx.action);

    rules.push({
      rule: "ACTION_IN_ALLOWED_LIST",
      passed: true,
      detail: `${ctx.action} is one of the agent's permitted actions`,
    });

    if (!ALWAYS_ALLOWED.has(ctx.action)) {
      rules.push({
        rule: "NO_DISPUTE_STOP",
        passed: !ctx.disputed,
        detail: ctx.disputed
          ? "Genuine billing dispute detected; automated collections must stop"
          : "No billing dispute on record",
      });
    }

    if (isRetry) {
      rules.push({
        rule: "MAX_RETRY_ATTEMPTS",
        passed: ctx.retryCount < cfg.maxRetryAttemptsPerCase,
        detail: `Retries used ${ctx.retryCount}/${cfg.maxRetryAttemptsPerCase}`,
      });
      const retryable =
        ctx.failureReason === null || cfg.retryableFailureReasons.includes(ctx.failureReason);
      rules.push({
        rule: "RETRYABLE_FAILURE_REASON",
        passed: retryable,
        detail:
          ctx.failureReason === null
            ? "No payment-level failure reason (non-payment scenario)"
            : retryable
              ? `${ctx.failureReason} is retryable`
              : `${ctx.failureReason} must not be auto-retried; customer action is required`,
      });
    }

    if (isContact) {
      rules.push({
        rule: "MAX_CONTACT_ATTEMPTS",
        passed: ctx.contactCount < cfg.maxContactAttemptsPerCase,
        detail: `Contacts used ${ctx.contactCount}/${cfg.maxContactAttemptsPerCase}`,
      });
      const hourNow = Number(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }).format(new Date()),
      );
      const inWindow =
        hourNow >= cfg.contactWindowStartHourIST && hourNow < cfg.contactWindowEndHourIST;
      rules.push({
        rule: "CONTACT_HOURS_IST",
        passed: inWindow,
        detail: `Current IST hour ${hourNow}, allowed window ${cfg.contactWindowStartHourIST}:00-${cfg.contactWindowEndHourIST}:00`,
      });
      const cooldownOk =
        ctx.hoursSinceLastContact === null ||
        ctx.hoursSinceLastContact >= cfg.minHoursBetweenContacts;
      rules.push({
        rule: "CONTACT_COOLDOWN",
        passed: cooldownOk,
        detail:
          ctx.hoursSinceLastContact === null
            ? "No previous contact on this case"
            : `${ctx.hoursSinceLastContact}h since last contact (min ${cfg.minHoursBetweenContacts}h)`,
      });
    }

    const allowed = rules.every((rule) => rule.passed);
    const failedRule = rules.find((rule) => !rule.passed) ?? null;

    return {
      decision: allowed ? "ALLOW" : "DENY",
      action: ctx.action,
      fallbackAction: allowed ? null : this.fallbackFor(ctx, failedRule?.rule ?? null),
      rules,
      reason: allowed
        ? `All policy checks passed for ${ctx.action}`
        : `${failedRule?.rule ?? "POLICY"}: ${failedRule?.detail ?? "denied"}`,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private fallbackFor(ctx: EvaluationContext, failedRule: string | null): RecommendedAction {
    if (failedRule === "CONTACT_HOURS_IST" || failedRule === "CONTACT_COOLDOWN") {
      return "NO_ACTION";
    }
    if (failedRule === "MAX_RETRY_ATTEMPTS" || failedRule === "RETRYABLE_FAILURE_REASON") {
      return this.paymentFallbackForRetry(ctx.failureReason);
    }
    return "CREATE_ESCALATION";
  }

  private paymentFallbackForRetry(failureReason: string | null): RecommendedAction {
    switch (failureReason) {
      case "EXPIRED_CARD":
      case "AUTHENTICATION_FAILED":
        return "SEND_PAYMENT_UPDATE_LINK";
      case "DECLINED_BY_BANK":
      case "INSUFFICIENT_FUNDS":
      case "TECHNICAL_ERROR":
      case "UNKNOWN":
      default:
        return "SEND_PAYMENT_LINK";
    }
  }

  private hourFromEnv(key: string, fallback: number, max: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value >= 0 && value <= max ? value : fallback;
  }
}
