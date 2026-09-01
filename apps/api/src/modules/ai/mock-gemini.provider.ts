import { Injectable } from "@nestjs/common";
import type { AiDecision, DiagnosisInput, RecommendedAction, Recoverability } from "@revrec/shared";
import type { AiDiagnosisProvider } from "./ai-provider.interface";

interface Verdict {
  classification: string;
  rootCause: string;
  recoverability: Recoverability;
  recommendedAction: RecommendedAction;
  confidence: number;
  reason: string;
}

/**
 * Offline stand-in for Gemini. Deterministic rule-based "reasoning" that
 * mirrors how the real model is expected to behave on our scenarios
 * (guide §4.1: reliable customer + expired card -> send update link).
 * Swap in GeminiProvider by setting GEMINI_API_KEY.
 */
@Injectable()
export class MockGeminiProvider implements AiDiagnosisProvider {
  readonly name = "mock-gemini";

  async diagnose(input: DiagnosisInput): Promise<AiDecision> {
    const verdict = this.decide(input);
    return {
      classification: verdict.classification,
      rootCause: verdict.rootCause,
      recoverability: verdict.recoverability,
      recommendedAction: verdict.recommendedAction,
      confidence: Math.round(verdict.confidence * 100) / 100,
      reason: verdict.reason,
    };
  }

  private decide(input: DiagnosisInput): Verdict {
    switch (input.caseType) {
      case "FAILED_PAYMENT":
        return this.failedPayment(input);
      case "FAILED_SUBSCRIPTION":
        return this.subscription(input);
      case "CHECKOUT_ABANDONMENT":
        return this.checkout(input);
      case "OVERDUE_INVOICE":
        return this.invoice(input);
      case "MANDATE_FAILURE":
        return this.mandate(input);
      default:
        return {
          classification: "unknown_scenario",
          rootCause: input.failureReason?.toLowerCase() ?? "unknown",
          recoverability: "MEDIUM",
          recommendedAction: "NO_ACTION",
          confidence: 0.3,
          reason: "Unrecognised case type — deferring to human review.",
        };
    }
  }

  private failedPayment(input: DiagnosisInput): Verdict {
    const reason = input.failureReason ?? "UNKNOWN";
    const reliable = input.successfulPayments >= 3;
    switch (reason) {
      case "EXPIRED_CARD":
        return reliable
          ? { classification: "payment_method_issue", rootCause: "expired_card", recoverability: "HIGH", recommendedAction: "SEND_PAYMENT_UPDATE_LINK", confidence: Math.min(0.97, 0.9 + input.successfulPayments * 0.01), reason: `${input.successfulPayments} successful past payments and an expired card — customer intent is proven, a payment-method update link should recover the full ${input.currency} ${input.amountAtRisk}.` }
          : { classification: "payment_method_issue", rootCause: "expired_card", recoverability: "MEDIUM", recommendedAction: "SEND_PAYMENT_UPDATE_LINK", confidence: 0.7, reason: "Card expired with limited payment history — update link still the safest next step." };
      case "INSUFFICIENT_FUNDS":
        return { classification: "temporary_shortfall", rootCause: "insufficient_funds", recoverability: "HIGH", recommendedAction: "SCHEDULE_RETRY", confidence: 0.88, reason: "Temporary shortfall, not lost intent — a retry after payday (24–72h) typically succeeds." };
      case "DECLINED_BY_BANK":
        return { classification: "bank_decline", rootCause: "declined_by_bank", recoverability: "MEDIUM", recommendedAction: "SEND_PAYMENT_LINK", confidence: 0.72, reason: "Bank decline may be risk-related — let the customer complete payment themselves via link instead of auto-retrying." };
      case "AUTHENTICATION_FAILED":
        return { classification: "authentication_issue", rootCause: "authentication_failed", recoverability: "LOW", recommendedAction: reliable ? "SEND_PAYMENT_UPDATE_LINK" : "CREATE_ESCALATION", confidence: 0.45, reason: "Authentication failure usually needs customer action; low likelihood of unattended recovery." };
      case "TECHNICAL_ERROR":
        return { classification: "technical_issue", rootCause: "technical_error", recoverability: "HIGH", recommendedAction: "RETRY_PAYMENT", confidence: 0.95, reason: "Transient gateway error — immediate retry is safe and highly likely to succeed." };
      default:
        return { classification: "unknown_failure", rootCause: reason.toLowerCase(), recoverability: "MEDIUM", recommendedAction: "SEND_PAYMENT_LINK", confidence: 0.6, reason: "Unclear failure reason — a self-serve payment link avoids risky auto-retries." };
    }
  }

  private subscription(input: DiagnosisInput): Verdict {
    const loyal = input.customerTenureDays >= 90;
    if (input.failureReason === "EXPIRED_CARD" || loyal) {
      return { classification: "payment_method_issue", rootCause: input.failureReason?.toLowerCase() ?? "renewal_failure", recoverability: "HIGH", recommendedAction: "SEND_PAYMENT_UPDATE_LINK", confidence: loyal ? 0.91 : 0.85, reason: `Subscriber with ${Math.round(input.customerTenureDays / 30)} months of tenure — churn risk is low; request updated payment method.` };
    }
    if (input.failureReason === "TECHNICAL_ERROR") {
      return { classification: "technical_issue", rootCause: "technical_error", recoverability: "HIGH", recommendedAction: "RETRY_PAYMENT", confidence: 0.93, reason: "Renewal failed on a transient error — retry before bothering the customer." };
    }
    return { classification: "renewal_failure", rootCause: input.failureReason?.toLowerCase() ?? "unknown", recoverability: "MEDIUM", recommendedAction: "SEND_EMAIL", confidence: 0.62, reason: "Renewal failure without clear cause — polite email asking to confirm continuation." };
  }

  private checkout(input: DiagnosisInput): Verdict {
    const bigTicket = input.amountAtRisk >= 50_000;
    if (bigTicket) {
      return { classification: "checkout_dropoff", rootCause: "payment_step_friction", recoverability: "MEDIUM", recommendedAction: "SEND_PAYMENT_LINK", confidence: 0.68, reason: `High-value cart (${input.currency} ${input.amountAtRisk}) dropped at payment step — friction, not rejection; one-click recovery link justified.` };
    }
    return { classification: "price_comparison", rootCause: "customer_dropoff", recoverability: "LOW", recommendedAction: "SEND_EMAIL", confidence: 0.38, reason: "Small cart abandonment often signals comparison shopping — send at most one gentle nudge." };
  }

  private invoice(input: DiagnosisInput): Verdict {
    const days = input.daysOverdue ?? 0;
    const noFailedHistory = input.failedPayments === 0;
    if (noFailedHistory && days <= 30) {
      return { classification: "receivables_delay", rootCause: "internal_processing_delay", recoverability: "HIGH", recommendedAction: "SEND_EMAIL", confidence: 0.86, reason: `Invoice ${days} days overdue but the payer has a clean history — likely internal processing delay; send a polite finance reminder.` };
    }
    if (days > 45) {
      return { classification: "receivables_dispute_risk", rootCause: "possible_dispute", recoverability: "LOW", recommendedAction: "CREATE_ESCALATION", confidence: 0.4, reason: `Severely overdue (${days} days) — stop automated chasing and hand to human collections per policy.` };
    }
    return { classification: "receivables_delay", rootCause: "cash_flow_timing", recoverability: "MEDIUM", recommendedAction: "SEND_EMAIL", confidence: 0.64, reason: "Moderately overdue with some payment friction on record — structured reminder with payment link." };
  }

  private mandate(input: DiagnosisInput): Verdict {
    if (input.failureReason === "TECHNICAL_ERROR") {
      return { classification: "mandate_issue", rootCause: "technical_error", recoverability: "HIGH", recommendedAction: "SCHEDULE_RETRY", confidence: 0.8, reason: "Auto-debit hit a temporary bank issue — start the controlled retry sequence (Day 1 / Day 3)." };
    }
    return { classification: "mandate_issue", rootCause: input.failureReason?.toLowerCase() ?? "mandate_invalid", recoverability: "LOW", recommendedAction: "CREATE_ESCALATION", confidence: 0.42, reason: "Mandate itself appears broken — customer must re-authorise; escalate beyond automated retries." };
  }
}

