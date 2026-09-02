import { z } from "zod";
import { RECOMMENDED_ACTIONS, type RecommendedAction } from "./enums";

export const recoverySequenceStepSchema = z.object({
  label: z.string().trim().min(1).max(80),
  action: z.enum(RECOMMENDED_ACTIONS),
  waitHours: z.number().int().min(0).max(24 * 90),
});
export type RecoverySequenceStep = z.infer<typeof recoverySequenceStepSchema>;

export const DEFAULT_RECOVERY_SEQUENCE: RecoverySequenceStep[] = [
  { label: "Payment link", action: "SEND_PAYMENT_LINK", waitHours: 0 },
  { label: "Reminder", action: "SEND_EMAIL", waitHours: 24 },
  { label: "Final reminder", action: "SEND_EMAIL", waitHours: 72 },
  { label: "Human escalation", action: "CREATE_ESCALATION", waitHours: 120 },
];

export const recoverySequenceConfigSchema = z
  .array(recoverySequenceStepSchema)
  .min(1)
  .max(8)
  .refine((steps) => steps.at(-1)?.action === "CREATE_ESCALATION", {
    message: "Recovery sequences must end with CREATE_ESCALATION",
  });

export const recoverySequenceSweepRequestSchema = z.object({
  limit: z.number().int().min(1).max(500).optional().default(50),
});
export type RecoverySequenceSweepRequest = z.infer<typeof recoverySequenceSweepRequestSchema>;

export interface RecoverySequenceResult {
  caseId: number;
  state: "EXECUTED" | "WAITING" | "STOPPED" | "COMPLETE" | "PAUSED";
  step: RecoverySequenceStep | null;
  dueAt: string | null;
  detail: string;
  caseStatus: string;
}
