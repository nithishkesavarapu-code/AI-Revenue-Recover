import Link from "next/link";
import type { ApiPromiseToPay } from "@revrec/shared";
import { apiGet, formatDateTime, formatInr } from "@/lib/api";
import { runPtpSweep, settlePromise } from "@/app/ptp-actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  RECORDED: "bg-sky-900/60 text-sky-300",
  FOLLOWED_UP: "bg-amber-900/50 text-amber-300",
  FULFILLED: "bg-emerald-900/60 text-emerald-300",
  BROKEN: "bg-rose-900/60 text-rose-300",
};

async function loadPromises() {
  try {
    const promises = await apiGet<ApiPromiseToPay[]>("/ptp");
    return { promises, error: null as string | null };
  } catch {
    return {
      promises: [] as ApiPromiseToPay[],
      error: "Cannot reach the API. Start it with `npm run dev:api`.",
    };
  }
}

export default async function PromisesPage() {
  const { promises, error } = await loadPromises();

  return (
    <main className="finance-main mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center gap-4 text-sm">
        <Link href="/" className="text-sky-400 hover:underline">Dashboard</Link>
        <span className="text-slate-600">/</span>
        <span className="font-medium text-slate-200">Promise-to-Pay Tracker</span>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Promise-to-Pay Tracker</h1>
          <p className="mt-1 text-sm text-slate-400">
            Customer commitments recorded from voice calls and messages, tracked to their promised date.
          </p>
        </div>
        <form action={runPtpSweep}>
          <button
            type="submit"
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-600"
          >
            Run due-date sweep
          </button>
        </form>
      </header>

      {error ? (
        <div className="mt-6 rounded-xl border border-amber-800 bg-amber-950/50 p-4 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      {promises.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Promised amount</th>
                <th className="px-4 py-3">Promised on</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Follow-ups</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Settle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {promises.map((p) => (
                <tr key={p.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3">
                    <Link href={`/cases/${p.caseId}`} className="text-sky-400 hover:underline">
                      #{p.caseId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {p.caseInfo.customerName}
                    {p.transcript ? (
                      <p className="mt-0.5 max-w-[220px] truncate text-xs italic text-slate-500">
                        "{p.transcript}"
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatInr(p.amount)}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDateTime(p.promisedOn)}</td>
                  <td className="px-4 py-3 text-xs uppercase text-slate-400">{p.source}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{p.followUps}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[p.status] ?? ""}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.status === "RECORDED" || p.status === "FOLLOWED_UP" ? (
                      <form action={settlePromise} className="flex gap-1.5">
                        <input type="hidden" name="promiseId" value={p.id} />
                        <button
                          name="outcome"
                          value="SUCCESS"
                          className="rounded bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600"
                        >
                          Paid
                        </button>
                        <button
                          name="outcome"
                          value="FAILURE"
                          className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                        >
                          Broke it
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-600">settled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error ? (
        <p className="mt-8 text-sm text-slate-400">
          No promises recorded yet. Trigger a voice call with{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">
            POST /voice/simulate-call/:caseId
          </code>{" "}
          . A "kal payment karunga" reply creates one automatically.
        </p>
      ) : null}

      <footer className="mt-12 border-t border-slate-800 pt-4 text-xs text-slate-500">
        Promise-to-pay monitoring keeps customer commitments visible. Due promises receive one policy-gated
        reminder, while broken commitments escalate automatically.
      </footer>
    </main>
  );
}
