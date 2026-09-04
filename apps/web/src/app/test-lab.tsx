"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createDemoCase,
  diagnoseDemoCase,
  executeRecommendedDemoAction,
  grantDemoEmailConsent,
  simulateRecoveryDemo,
  simulateVoiceDemo,
  type DemoActionState,
} from "@/app/demo-actions";

const INITIAL_STATE: DemoActionState = { message: "" };

function Result({ state }: { state: DemoActionState }) {
  if (!state.message) return null;
  return (
    <p className={`mt-3 text-sm ${state.error ? "text-rose-600" : "text-slate-600"}`} aria-live="polite">
      {state.message}
    </p>
  );
}

export function TestLab() {
  const [caseId, setCaseId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [demoAccessToken, setDemoAccessToken] = useState("");
  const [createState, createAction, creating] = useActionState(createDemoCase, INITIAL_STATE);
  const [diagnoseState, diagnoseAction, diagnosing] = useActionState(diagnoseDemoCase, INITIAL_STATE);
  const [consentState, consentAction, consenting] = useActionState(grantDemoEmailConsent, INITIAL_STATE);
  const [executionState, executionAction, executing] = useActionState(executeRecommendedDemoAction, INITIAL_STATE);
  const [voiceState, voiceAction, calling] = useActionState(simulateVoiceDemo, INITIAL_STATE);
  const [recoveryState, recoveryAction, recovering] = useActionState(simulateRecoveryDemo, INITIAL_STATE);

  useEffect(() => {
    const latestCaseId = createState.caseId ?? diagnoseState.caseId ?? executionState.caseId ?? voiceState.caseId ?? recoveryState.caseId;
    if (latestCaseId) setCaseId(String(latestCaseId));
    if (createState.customerId) setCustomerId(String(createState.customerId));
  }, [createState, diagnoseState, executionState, voiceState, recoveryState]);

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

      <label className="mb-4 block max-w-md text-sm font-medium text-slate-700">
        Private demo access token
        <input
          type="password"
          value={demoAccessToken}
          onChange={(event) => setDemoAccessToken(event.target.value)}
          placeholder="Enter the token configured on Railway"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createAction} className="rounded-xl border border-blue-100 bg-white p-4">
          <input type="hidden" name="demoAccessToken" value={demoAccessToken} />
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
            <label className="text-sm text-slate-700">Test customer name (optional)
              <input name="customerName" placeholder="Demo Customer" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-700">Test customer email (optional)
              <input name="customerEmail" type="email" placeholder="your-email@gmail.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Leave both customer fields empty for random synthetic data. Enter both to create a case for a specific test customer.</p>
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
          <p className="mt-2 text-xs text-slate-500">Customer ID: {customerId || "Create a test case first"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={consentAction}><input type="hidden" name="demoAccessToken" value={demoAccessToken} /><input type="hidden" name="customerId" value={customerId} /><button disabled={consenting} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">{consenting ? "Saving..." : "Grant Demo Email Consent"}</button></form>
            <form action={diagnoseAction}><input type="hidden" name="demoAccessToken" value={demoAccessToken} /><input type="hidden" name="caseId" value={caseId} /><button disabled={diagnosing} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">{diagnosing ? "Diagnosing..." : "Run AI Diagnosis"}</button></form>
            <form action={executionAction}><input type="hidden" name="demoAccessToken" value={demoAccessToken} /><input type="hidden" name="caseId" value={caseId} /><button disabled={executing} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">{executing ? "Executing..." : "Execute Recommended Action"}</button></form>
            <form action={recoveryAction}><input type="hidden" name="demoAccessToken" value={demoAccessToken} /><input type="hidden" name="caseId" value={caseId} /><button disabled={recovering} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">{recovering ? "Verifying..." : "Mock Payment Success"}</button></form>
          </div>
          <Result state={consentState} />
          <Result state={diagnoseState} />
          <Result state={executionState} />
          <Result state={recoveryState} />
        </div>

        <form action={voiceAction} className="rounded-xl border border-blue-100 bg-white p-4 lg:col-span-2">
          <input type="hidden" name="demoAccessToken" value={demoAccessToken} />
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
