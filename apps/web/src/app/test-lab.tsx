"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createDemoCase,
  diagnoseDemoCase,
  simulateRecoveryDemo,
  simulateVoiceDemo,
  type DemoActionState,
} from "@/app/demo-actions";

const INITIAL_STATE: DemoActionState = { message: "Create a case to begin." };

function Result({ state }: { state: DemoActionState }) {
  return (
    <p className={`mt-3 text-sm ${state.error ? "text-rose-600" : "text-slate-600"}`} aria-live="polite">
      {state.message}
    </p>
  );
}

export function TestLab() {
  const [caseId, setCaseId] = useState("");
  const [createState, createAction, creating] = useActionState(createDemoCase, INITIAL_STATE);
  const [diagnoseState, diagnoseAction, diagnosing] = useActionState(diagnoseDemoCase, INITIAL_STATE);
  const [voiceState, voiceAction, calling] = useActionState(simulateVoiceDemo, INITIAL_STATE);
  const [recoveryState, recoveryAction, recovering] = useActionState(simulateRecoveryDemo, INITIAL_STATE);

  useEffect(() => {
    const latestCaseId = createState.caseId ?? diagnoseState.caseId ?? voiceState.caseId ?? recoveryState.caseId;
    if (latestCaseId) setCaseId(String(latestCaseId));
  }, [createState, diagnoseState, voiceState, recoveryState]);

  return (
    <section className="mb-8 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-[0_12px_28px_rgba(29,78,160,0.07)]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Demo controls</p>
          <h2 className="mt-1 text-xl font-semibold text-[#102b5c]">Recovery Test Lab</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Create synthetic cases and test AI and voice routing without PowerShell.</p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Demo mode only</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createAction} className="rounded-xl border border-blue-100 bg-white p-4">
          <h3 className="font-semibold text-[#102b5c]">1. Create failed payment</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700">Amount (INR)
              <input name="amount" type="number" min="1" defaultValue="499" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-700">Failure reason
              <select name="failureReason" defaultValue="EXPIRED_CARD" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="EXPIRED_CARD">Expired card</option>
                <option value="INSUFFICIENT_FUNDS">Insufficient funds</option>
                <option value="DECLINED_BY_BANK">Declined by bank</option>
                <option value="AUTHENTICATION_FAILED">Authentication failed</option>
              </select>
            </label>
          </div>
          <button disabled={creating} className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
            {creating ? "Creating..." : "Create Test Case"}
          </button>
          <Result state={createState} />
        </form>

        <div className="rounded-xl border border-blue-100 bg-white p-4">
          <h3 className="font-semibold text-[#102b5c]">2. Run workflow checks</h3>
          <label className="mt-3 block text-sm text-slate-700">Case ID
            <input value={caseId} onChange={(event) => setCaseId(event.target.value)} placeholder="Created case ID" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={diagnoseAction}><input type="hidden" name="caseId" value={caseId} /><button disabled={diagnosing} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">{diagnosing ? "Diagnosing..." : "Run AI Diagnosis"}</button></form>
            <form action={recoveryAction}><input type="hidden" name="caseId" value={caseId} /><button disabled={recovering} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">{recovering ? "Verifying..." : "Mock Payment Success"}</button></form>
          </div>
          <Result state={diagnoseState.error ? diagnoseState : recoveryState} />
        </div>

        <form action={voiceAction} className="rounded-xl border border-blue-100 bg-white p-4 lg:col-span-2">
          <h3 className="font-semibold text-[#102b5c]">3. Simulate Hinglish voice call</h3>
          <p className="mt-1 text-sm text-slate-600">This classifies the transcript as a promise, refusal, payment claim, or unclear response. It does not make a real phone call.</p>
          <input type="hidden" name="caseId" value={caseId} />
          <textarea name="transcript" rows={3} defaultValue="Link bhejo, main kal tak pura amount pay kar dunga." className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2" />
          <button disabled={calling} className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60">{calling ? "Processing..." : "Simulate Voice Response"}</button>
          <Result state={voiceState} />
        </form>
      </div>
    </section>
  );
}
