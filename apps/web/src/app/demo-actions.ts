"use server";

import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { apiPost } from "@/lib/api";

export type DemoActionState = {
  message: string;
  caseId?: number;
  customerId?: number;
  error?: boolean;
};

const initialFailureReason = "EXPIRED_CARD";

function demoEnabled() {
  return process.env.DEMO_MODE === "true";
}

function validDemoToken(value: FormDataEntryValue | null) {
  const expected = process.env.DEMO_ACCESS_TOKEN;
  if (!expected || typeof value !== "string") return false;

  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(value);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
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

async function runDemo(formData: FormData, action: () => Promise<DemoActionState>): Promise<DemoActionState> {
  if (!demoEnabled()) return { message: "Test Lab is disabled. Set DEMO_MODE=true on the dashboard service.", error: true };
  if (!process.env.DEMO_ACCESS_TOKEN) {
    return { message: "Test Lab is unavailable. Configure DEMO_ACCESS_TOKEN on the dashboard service.", error: true };
  }
  if (!validDemoToken(formData.get("demoAccessToken"))) {
    return { message: "Enter the private demo access token to use Test Lab controls.", error: true };
  }
  try {
    return complete(await action());
  } catch (error) {
    return { message: error instanceof Error ? error.message : "The test request failed.", error: true };
  }
}

export async function createDemoCase(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(formData, async () => {
    const amount = Number(formData.get("amount")) || 499;
    const failureReason = String(formData.get("failureReason") || initialFailureReason);
    const customerName = String(formData.get("customerName") ?? "").trim();
    const customerEmail = String(formData.get("customerEmail") ?? "").trim();
    if (customerName || customerEmail) {
      if (!customerName || !customerEmail) throw new Error("Enter both customer name and email, or leave both blank for synthetic data.");
      const result = await apiPost<{ caseId: number; customerId: number }>("/events/revenue", {
        provider: "dashboard-demo",
        eventId: `dashboard-demo-${crypto.randomUUID()}`,
        type: "PAYMENT_FAILED",
        sourceReference: `demo-${Date.now()}`,
        amount,
        currency: "INR",
        failureReason,
        customer: { name: customerName, email: customerEmail },
      });
      return { message: `Created failed-payment case #${result.caseId} for ${customerName}.`, caseId: result.caseId, customerId: result.customerId };
    }
    const result = await apiPost<{ caseId: number; customerId: number }>("/simulator/events/payment-failure", { amount, failureReason });
    return { message: `Created failed-payment case #${result.caseId}.`, caseId: result.caseId, customerId: result.customerId };
  });
}

export async function diagnoseDemoCase(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(formData, async () => {
    const caseId = formCaseId(formData);
    const result = await apiPost<{ decision: { rootCause: string; recommendedAction: string } }>(`/ai/diagnose/${caseId}`, {});
    return {
      message: `AI diagnosis: ${result.decision.rootCause.replace(/_/g, " ")}. Recommended: ${result.decision.recommendedAction.replace(/_/g, " ")}.`,
      caseId,
    };
  });
}

export async function simulateVoiceDemo(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(formData, async () => {
    const caseId = formCaseId(formData);
    const transcript = String(formData.get("transcript") ?? "").trim();
    const result = await apiPost<{ intent: string; detail: string }>(`/voice/simulate-call/${caseId}`, {
      transcript: transcript || undefined,
    });
    return { message: `Voice intent: ${result.intent.replace(/_/g, " ")}. ${result.detail}`, caseId };
  });
}

export async function simulateRecoveryDemo(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(formData, async () => {
    const caseId = formCaseId(formData);
    const result = await apiPost<{ detail: string }>(`/verification/customer/${caseId}`, {
      outcome: "SUCCESS",
      demoAccessToken: formData.get("demoAccessToken"),
    });
    return { message: `Mock recovery recorded. ${result.detail}`, caseId };
  });
}

export async function grantDemoEmailConsent(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(formData, async () => {
    const customerId = Number(formData.get("customerId"));
    if (!Number.isInteger(customerId) || customerId <= 0) throw new Error("Create a test case first so the customer ID is available.");
    await apiPost(`/customers/${customerId}/preferences`, {
      channel: "EMAIL",
      status: "OPTED_IN",
      source: "dashboard-demo-consent",
    });
    return { message: "Demo email consent recorded. You can now execute an email or payment-link action during the permitted contact window.", customerId };
  });
}

export async function executeRecommendedDemoAction(_: DemoActionState, formData: FormData): Promise<DemoActionState> {
  return runDemo(formData, async () => {
    const caseId = formCaseId(formData);
    const result = await apiPost<{ detail: string; executedAction: string; policyDecision: { decision: string; reason: string } }>(`/cases/${caseId}/execute`, {});
    return {
      message: `${result.policyDecision.decision}: ${result.executedAction.replace(/_/g, " ")}. ${result.detail ?? result.policyDecision.reason}`,
      caseId,
    };
  });
}
