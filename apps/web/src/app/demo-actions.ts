"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";

export type DemoActionState = {
  message: string;
  caseId?: number;
  error?: boolean;
};

const initialFailureReason = "EXPIRED_CARD";

function demoEnabled() {
  return process.env.DEMO_MODE === "true";
}

function formCaseId(formData: FormData) {
  const caseId = Number(formData.get("caseId"));
  if (!Number.isInteger(caseId) || caseId <= 0) throw new Error("Enter a valid case ID first.");
  return caseId;
}

function complete(state: DemoActionState) {
  revalidatePath("/");
  revalidatePath("/promises");
  return state;
}

async function runDemo(action: () => Promise<DemoActionState>): Promise<DemoActionState> {
  if (!demoEnabled()) return { message: "Test Lab is disabled. Set DEMO_MODE=true on the dashboard service.", error: true };
  try {
    return complete(await action());
  } catch (error) {
    return { message: error instanceof Error ? error.message : "The test request failed.", error: true };
  }
}

export async function createDemoCase(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(async () => {
    const amount = Number(formData.get("amount")) || 499;
    const failureReason = String(formData.get("failureReason") || initialFailureReason);
    const result = await apiPost<{ caseId: number }>("/simulator/events/payment-failure", { amount, failureReason });
    return { message: `Created failed-payment case #${result.caseId}.`, caseId: result.caseId };
  });
}

export async function diagnoseDemoCase(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(async () => {
    const caseId = formCaseId(formData);
    const result = await apiPost<{ rootCause: string; recommendedAction: string }>(`/ai/diagnose/${caseId}`, {});
    return {
      message: `AI diagnosis: ${result.rootCause.replace(/_/g, " ")}. Recommended: ${result.recommendedAction.replace(/_/g, " ")}.`,
      caseId,
    };
  });
}

export async function simulateVoiceDemo(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(async () => {
    const caseId = formCaseId(formData);
    const transcript = String(formData.get("transcript") ?? "").trim();
    const result = await apiPost<{ intent: string; detail: string }>(`/voice/simulate-call/${caseId}`, {
      transcript: transcript || undefined,
    });
    return { message: `Voice intent: ${result.intent.replace(/_/g, " ")}. ${result.detail}`, caseId };
  });
}

export async function simulateRecoveryDemo(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(async () => {
    const caseId = formCaseId(formData);
    const result = await apiPost<{ detail: string }>(`/verification/customer/${caseId}`, { outcome: "SUCCESS" });
    return { message: `Mock recovery recorded. ${result.detail}`, caseId };
  });
}
