import Link from "next/link";
import type { ApiCaseListItem, StatsSummary } from "@revrec/shared";
import { runRecoveryAgent } from "@/app/agent-actions";
import { apiGet, formatDateTime, formatInr } from "@/lib/api";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-slate-700/60 text-slate-200",
  DIAGNOSED: "bg-sky-900/60 text-sky-300",
  ACTION_TAKEN: "bg-indigo-900/60 text-indigo-300",
  WAITING_CUSTOMER: "bg-amber-900/50 text-amber-300",
  RECOVERED: "bg-emerald-900/60 text-emerald-300",
  ESCALATED: "bg-rose-900/60 text-rose-300",
  CLOSED_LOST: "bg-zinc-800 text-zinc-400",
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "text-slate-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-rose-400 font-semibold",
};

const TYPE_LABELS: Record<string, string> = {
  FAILED_PAYMENT: "Failed Payment",
  CHECKOUT_ABANDONMENT: "Checkout Drop-off",
  FAILED_SUBSCRIPTION: "Failed Renewal",
  OVERDUE_INVOICE: "Overdue Invoice",
  MANDATE_FAILURE: "Mandate Failure",
};

interface StrategyRow {
  action: string;
  cases: number;
  recoveredCases: number;
  recoveryRatePct: number;
  amountAtRisk: number;
  recoveredAmount: number;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

async function getData() {
  try {
    const [stats, cases, strategies] = await Promise.all([
      apiGet<StatsSummary>("/cases/stats/summary"),
      apiGet<ApiCaseListItem[]>("/cases?take=15"),
      apiGet<StrategyRow[]>("/cases/stats/strategies"),
    ]);
    return { stats, cases, strategies, error: null as string | null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown API error";
    console.error("Failed to load dashboard data:", error);
    return {
      stats: null,
      cases: null,
      strategies: null,
      error: `Dashboard data is unavailable: ${detail}`,
    };
  }
}

export default async function DashboardPage() {
  const { stats, cases, strategies, error } = await getData();

  return (
    <main className="finance-main mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex items-center gap-4 text-sm">
        <span className="font-medium text-slate-200">Dashboard</span>
        <span className="text-slate-600">.</span>
        <Link href="/promises" className="text-sky-400 hover:underline">
          Promise-to-Pay Tracker
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-[0_16px_40px_rgba(29,78,160,0.08)]">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Revenue operations</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#102b5c]">AI Revenue Recovery</h1>
          <p className="mt-1 text-sm text-slate-400">
            Detect at-risk revenue, diagnose the cause, execute a policy-bounded action, and verify recovered money.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form action={runRecoveryAgent}>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              Run Batch Agent
            </button>
          </form>
          <span className="rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-300">
            Live
          </span>
        </div>
      </header>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-100">Bounded recovery workflow is live.</p>
        <p className="mt-1 text-slate-400">
          The batch agent prioritizes active cases, runs AI diagnosis, applies policy checks, executes the safe next
          action, verifies recoveries, and sweeps due promise-to-pay commitments with a full audit trail.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-800 bg-amber-950/50 p-4 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      {stats ? (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="At Risk"
              value={formatInr(stats.totalAtRisk)}
              sub={`${stats.activeCases} active cases`}
              accent="text-amber-400"
            />
            <KpiCard
              label="Recovered"
              value={formatInr(stats.totalRecovered)}
              sub={`${stats.recoveredCases} cases closed as recovered`}
              accent="text-emerald-400"
            />
            <KpiCard
              label="Recovery Rate"
              value={`${stats.recoveryRatePct}%`}
              sub="Recovered / total detected revenue"
              accent="text-sky-400"
            />
            <KpiCard
              label="Human Review"
              value={String(stats.humanReview)}
              sub={`${stats.waitingCustomer} waiting on customer`}
              accent="text-rose-400"
            />
          </section>

          {stats.byType.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                Batch Analytics By Scenario
              </h2>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Scenario</th>
                      <th className="px-4 py-3">Cases</th>
                      <th className="px-4 py-3">At risk</th>
                      <th className="px-4 py-3">Recovered</th>
                      <th className="px-4 py-3">Recovery rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {stats.byType.map((item) => {
                      const denominator = item.atRisk + item.recovered;
                      const rate = denominator > 0 ? Math.round((item.recovered / denominator) * 1000) / 10 : 0;
                      return (
                        <tr key={item.type}>
                          <td className="px-4 py-3 font-medium">{TYPE_LABELS[item.type] ?? item.type}</td>
                          <td className="px-4 py-3 text-slate-400">{item.cases}</td>
                          <td className="px-4 py-3 text-amber-400">{formatInr(item.atRisk)}</td>
                          <td className="px-4 py-3 text-emerald-400">{formatInr(item.recovered)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${Math.min(rate, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-300">{rate}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {strategies && strategies.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Strategy Performance
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Strategy</th>
                  <th className="px-4 py-3">Cases</th>
                  <th className="px-4 py-3">Recovered</th>
                  <th className="px-4 py-3">Recovery rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {strategies.map((strategy) => (
                  <tr key={strategy.action}>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-indigo-300">
                        {strategy.action}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{strategy.cases}</td>
                    <td className="px-4 py-3 text-emerald-400">{strategy.recoveredCases}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(strategy.recoveryRatePct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-300">{strategy.recoveryRatePct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {cases && cases.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Recovery Cases</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Root Cause (AI)</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Detected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {cases.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/cases/${item.id}`}
                        className="text-sky-400 hover:text-sky-300 hover:underline"
                      >
                        #{item.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.customer.name}</div>
                      <div className="text-xs text-slate-500">{item.customer.company ?? item.customer.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{TYPE_LABELS[item.type] ?? item.type}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatInr(item.amountAtRisk)}
                      {item.recoveredAmount ? (
                        <div className="text-xs text-emerald-400">Recovered {formatInr(item.recoveredAmount)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {item.aiDecision ? (
                        <>
                          <span className="text-slate-300">{item.aiDecision.rootCause}</span>
                          <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-sky-300">
                            {Math.round(item.aiDecision.confidence * 100)}%
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-600">Pending diagnosis</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {item.recommendedAction ? (
                        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">
                          {item.recommendedAction}
                        </code>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          STATUS_STYLES[item.status] ?? "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs ${PRIORITY_STYLES[item.priority] ?? ""}`}>
                      {item.priority}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!error && cases && cases.length === 0 ? (
        <p className="mt-8 text-sm text-slate-400">
          No recovery cases yet. Run `npm run db:seed` to load the synthetic dataset.
        </p>
      ) : null}

      <footer className="mt-12 border-t border-slate-800 pt-4 text-xs text-slate-500">
        Live system: event detection, AI diagnosis, policy-bounded execution, verification, promise-to-pay tracking,
        and batch recovery orchestration.
      </footer>
    </main>
  );
}
