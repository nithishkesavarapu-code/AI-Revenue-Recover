"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";

/** Runs the promise-to-pay due-sweep from the /promises page. */
export async function runPtpSweep(): Promise<void> {
  try {
    await apiPost("/ptp/sweep", {});
  } catch {
    // API offline: keep the current page state.
  }
  revalidatePath("/promises");
  revalidatePath("/");
}

/** Settles a single promise as fulfilled or broken. */
export async function settlePromise(formData: FormData): Promise<void> {
  const id = String(formData.get("promiseId") ?? "");
  const outcome = String(formData.get("outcome") ?? "SUCCESS");
  if (!id || !["SUCCESS", "FAILURE"].includes(outcome)) return;

  try {
    await apiPost(`/ptp/${id}/settle`, { outcome });
  } catch {
    // Ignore the failure and refresh the current page state.
  }
  revalidatePath("/promises");
  revalidatePath("/");
}
