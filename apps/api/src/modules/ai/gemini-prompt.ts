import type { DiagnosisInput } from "@revrec/shared";

/** Gemini structured-output schema (OpenAPI subset) mirroring aiDecisionSchema. */
export const geminiResponseSchema = {
  type: "OBJECT",
  properties: {
    classification: { type: "STRING", description: "Short category, e.g. payment_method_issue" },
    rootCause: { type: "STRING", description: "Machine-readable root cause, e.g. expired_card" },
    recoverability: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
    recommendedAction: {
      type: "STRING",
      enum: [
        "RETRY_PAYMENT",
        "SEND_PAYMENT_LINK",
        "SEND_PAYMENT_UPDATE_LINK",
        "SEND_EMAIL",
        "SEND_SMS",
        "SCHEDULE_RETRY",
        "CREATE_ESCALATION",
        "CLOSE_CASE",
        "NO_ACTION",
      ],
    },
    confidence: { type: "NUMBER", description: "0 to 1" },
    reason: { type: "STRING", description: "One-sentence human-readable justification" },
  },
  required: [
    "classification",
    "rootCause",
    "recoverability",
    "recommendedAction",
    "confidence",
    "reason",
  ],
} as const;

export function buildDiagnosisPrompt(input: DiagnosisInput): string {
  return [
    "You are the diagnosis engine of an AI revenue-recovery agent.",
    "Given the context below, classify the problem and recommend exactly ONE next action.",
    "Rules:",
    "- Only use actions from the allowed list; never invent discounts or unlimited retries.",
    "- Prefer the least intrusive effective action.",
    "- Low recoverability should lead to CREATE_ESCALATION (human review).",
    "",
    `Case id: ${input.caseId}`,
    `Case type: ${input.caseType}`,
    `Failure reason: ${input.failureReason ?? "unknown"}`,
    `Amount at risk: ${input.currency} ${input.amountAtRisk}`,
    `Customer tenure (days): ${input.customerTenureDays}`,
    `Successful payments so far: ${input.successfulPayments}`,
    `Failed payments so far: ${input.failedPayments}`,
    `Previous contact/retry attempts: ${input.previousAttempts}`,
    input.daysOverdue != null ? `Days overdue: ${input.daysOverdue}` : null,
    "",
    "Respond ONLY with JSON matching the requested schema.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
