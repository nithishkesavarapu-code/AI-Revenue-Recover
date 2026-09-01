"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";

/** Runs the bounded recovery agent across the current batch of active cases. */
export async function runRecoveryAgent(): Promise<void> {
  try {
    await apiPost("/agent/recover-batch", {
      limit: 25,
      verifyWaitingCustomers: true,
      verificationSuccessRatePct: 60,
      runPromiseSweep: true,
    });
  } catch {
    // API offline or unavailable; keep the current UI state.
  }

  revalidatePath("/");
  revalidatePath("/promises");
}
