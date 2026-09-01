import { z } from "zod";

export const PTP_STATUSES = ["RECORDED", "FOLLOWED_UP", "FULFILLED", "BROKEN"] as const;
export type PtpStatus = (typeof PTP_STATUSES)[number];

/** POST /voice/simulate-call/:caseId */
export const voiceCallRequestSchema = z.object({
  /** Simulated speech-to-text output of the Hinglish call. Random sample if omitted. */
  transcript: z.string().max(500).optional(),
});
export type VoiceCallRequest = z.infer<typeof voiceCallRequestSchema>;

/** Intents our NLU layer can detect from a Hinglish conversation. */
export type VoiceIntent = "PAYMENT_DONE" | "PROMISE_TO_PAY" | "REFUSED" | "UNCLEAR";

export interface VoiceCallResult {
  caseId: number;
  intent: VoiceIntent;
  transcript: string;
  promisedOn: string | null;
  detail: string;
  caseStatus: string | null;
}

/** A promise row as returned by GET /ptp. */
export interface ApiPromiseToPay {
  id: number;
  caseId: number;
  amount: string;
  currency: string;
  promisedOn: string;
  status: PtpStatus;
  source: string;
  transcript: string | null;
  followUps: number;
  createdAt: string;
  caseInfo: {
    id: number;
    type: string;
    status: string;
    customerName: string;
    company: string | null;
  };
}

/** POST /ptp/:id/settle */
export const settlePtpRequestSchema = z.object({
  outcome: z.enum(["SUCCESS", "FAILURE"]),
});
export type SettlePtpRequest = z.infer<typeof settlePtpRequestSchema>;

/** Summary returned by POST /ptp/sweep. */
export interface PtpSweepResult {
  dueChecked: number;
  remindersSent: number;
  deferred: number;
  escalations: number;
  errors: Array<{ caseId: number; error: string }>;
}
