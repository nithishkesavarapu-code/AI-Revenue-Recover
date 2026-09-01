import Link from "next/link";
import { notFound } from "next/navigation";
import type { ApiCaseDetail } from "@revrec/shared";
import { apiGet, formatDateTime, formatInr } from "@/lib/api";
import { simulateCustomerAction } from "@/app/simulate-actions";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-slate-700/60 text-slate-200",
  DIAGNOSED: "bg-sky-900/60 text-sky-300",
  ACTION_TAKEN: "bg-indigo-900/60 text-indigo-300",
  WAITING_CUSTOMER: "bg-amber-900/50 text-amber-300",
  RECOVERED: "bg-emerald-900/60 text-emerald-300",
  ESCALATED: "bg-rose-900/60 text-rose-300",
  CLOSED_LOST: "bg-zinc-800 text-zinc-400",
};

const EVENT_STYLES: Record<string, string> = {
  DETECTED: "border-amber-500 bg-amber-500",
  DIAGNOSED: "border-sky-500 bg-sky-500",
  POLICY_DECISION: "border-indigo-500 bg-indigo-500",
  ACTION_EXECUTED: "border-violet-500 bg-violet-500",
  PAYMENT_VERIFIED: "border-emerald-500 bg-emerald-500",
  RETRY_FAILED: "border-orange-500 bg-orange-500",
  ESCALATED: "border-rose-500 bg-rose-500",
  CLOSED: "border-zinc-400 bg-zinc-400",
};

const RECOVERABILITY_STYLES: Record<string, string> = {
  HIGH: "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  MEDIUM: "bg-amber-900/50 text-amber-300 border-amber-700",
  LOW: "bg-rose-900/60 text-rose-300 border-rose-700",
};

const TYPE_LABELS: Record<string, string> = {
  FAILED_PAYMENT: "Failed Payment",
  CHECKOUT_ABANDONMENT: "Checkout Drop-off",
  FAILED_SUBSCRIPTION: "Failed Renewal",
  OVERDUE_INVOICE: "Overdue Invoice",
  MANDATE_FAILURE: "Mandate Failure",
};

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();

  let detail: ApiCaseDetail | null = null;
  try {
    detail = await apiGet<ApiCaseDetail>(`/cases/${caseId}`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
  }

  if (!detail) {
    return (
      <main className="finance-main mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-xl border border-amber-800 bg-amber-950/50 p-4 text-sm text-amber-200">
          Cannot reach the API. Start it with `npm run dev:api`.
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-sky-400 hover:underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const d = detail;
  const verifiable = d.status === "WAITING_CUSTOMER" || d.status === "ACTION_TAKEN";
  const ai = d.aiDecision;

  return (
    <main className="finance-main mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-sm text-sky-400 hover:underline">
        Back to dashboard
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Case #{d.id} / {TYPE_LABELS[d.type] ?? d.type}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {d.customer.name} / {d.customer.company ?? d.customer.email}
            {d.reason ? ` - ${d.reason}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[d.status] ?? ""}`}
        >
          {d.status.replace(/_/g, " ")}
        </span>
      </header>

      {d.status === "RECOVERED" && d.recoveredAmount ? (
        <div className="mt-4 rounded-xl border border-emerald-700 bg-emerald-950/60 p-4">
          <p className="text-emerald-300 font-semibold text-lg">
            {formatInr(d.recoveredAmount)} recovered and verified
          </p>
          <p className="text-xs text-emerald-500/80 mt-0.5">Closed {d.closedAt ? formatDateTime(d.closedAt) : ""}</p>
        </div>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* AI diagnosis card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            AI Diagnosis
          </h2>
          {ai ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded border px-2 py-0.5 text-xs ${RECOVERABILITY_STYLES[ai.recoverability] ?? ""}`}
                >
                  {ai.recoverability} recoverability
                </span>
                <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-sky-300">
                  {ai.classification}
                </code>
                <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-violet-300">
                  root cause: {ai.rootCause}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${Math.round(ai.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400">
                  {Math.round(ai.confidence * 100)}% confidence / {ai.provider}
                </span>
              </div>
              <p className="text-slate-300">{ai.reason}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No AI decision recorded for this case.</p>
          )}
        </div>

        {/* Recommended action + simulate panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Amount at risk
            </h2>
            <p className="mt-2 text-xl font-bold text-amber-400">{formatInr(d.amountAtRisk)}</p>
            {d.recommendedAction ? (
              <p className="mt-2 text-xs text-slate-400">
                Next action:{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-indigo-300">
                  {d.recommendedAction}
                </code>
              </p>
            ) : null}
          </div>

          {verifiable ? (
            <form
              action={simulateCustomerAction}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <input type="hidden" name="caseId" value={d.id} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Simulate customer
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Fire a verified payment event for this case.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  name="outcome"
                  value="SUCCESS"
                  className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium hover:bg-emerald-600"
                >
                  Pays now
                </button>
                <button
                  name="outcome"
                  value="FAILURE"
                  className="flex-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-600"
                >
                  Fails
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Timeline */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Case timeline
          </h2>
          {d.events.length > 0 ? (
            <ol className="mt-4 space-y-0">
              {d.events.map((ev, idx) => (
                <li key={ev.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {idx < d.events.length - 1 ? (
                    <span className="absolute left-[7px] top-4 h-full w-px bg-slate-700" />
                  ) : null}
                  <span
                    className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      EVENT_STYLES[ev.type] ?? "border-slate-500 bg-slate-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                        {ev.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formatDateTime(ev.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-300">{ev.message}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No events yet.</p>
          )}
        </div>

        {/* Contact attempts */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Contact history
          </h2>
          {d.contactAttempts.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {d.contactAttempts.map((c) => (
                <li key={c.id} className="border-l-2 border-indigo-700 pl-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-indigo-300">{c.channel}</span>
                    <span className="text-[11px] text-slate-500">{formatDateTime(c.sentAt)}</span>
                  </div>
                  {c.content ? (
                    <p className="mt-0.5 line-clamp-2 break-all text-xs text-slate-400">{c.content}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No contacts sent on this case.</p>
          )}
        </div>
      </section>
    </main>
  );
}
