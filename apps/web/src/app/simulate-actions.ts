"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";

/**
 * Simulates the customer's response to a recovery action, straight from the
 * case-detail page. Refreshes the detail view and the dashboard KPIs.
 */
export async function simulateCustomerAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("caseId") ?? "");
  const outcome = String(formData.get("outcome") ?? "SUCCESS");
  if (!caseId || !["SUCCESS", "FAILURE"].includes(outcome)) return;

  try {
    await apiPost(`/verification/customer/${caseId}`, { outcome });
  } catch {
    // API offline: keep the current page state.
  }
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/");
}
