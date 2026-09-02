# AI Revenue Recovery

Agentic system that detects at-risk revenue, diagnoses the cause, executes policy-bounded recovery actions, verifies whether money actually came back, and keeps an audit trail for every step.

## What it covers

- Payment degradation -> root cause -> retry, update-link, or payment-link recovery
- Checkout abandonment recovery
- Failed subscription recovery
- Overdue invoice follow-up
- Promise-to-pay tracking and due-date sweeps
- Hinglish voice recovery routing
- Batch recovery runs with measured recovered revenue

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 + TypeScript + Tailwind |
| Backend | NestJS 11 + TypeScript |
| Database | PostgreSQL 16 + Prisma |
| Background jobs | Redis 7 + BullMQ |
| AI | Mock Gemini provider by default, real Gemini when `GEMINI_API_KEY` is set |

## Monorepo layout

```text
apps/
  web/       Next.js dashboard
  api/       NestJS backend
packages/
  shared/    Shared types + Zod schemas
prisma/      Schema + seed data
```

## Getting started

```bash
npm install
npm run db:up
npm run db:deploy
npm run db:seed
npm run dev:api
npm run dev:web
```

- API: `http://localhost:3002`
- Dashboard: `http://localhost:3100`

## Core workflow

1. Revenue-loss events create business records plus `OPEN` recovery cases.
2. The diagnosis layer classifies root cause and recommends one bounded action.
3. The policy engine enforces retry caps, contact caps, contact windows, cooldowns, and dispute stops.
4. The tools layer executes only permitted actions and logs them.
5. Verification updates recovered money and closes linked invoices or subscriptions when payment succeeds.
6. Promise-to-pay rows are tracked separately and swept when due.
7. The batch agent runs the whole loop across a prioritized set of cases and returns measured recovery output.

## Main API endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Service health |
| GET | `/customers` | Customers with counts |
| GET | `/customers/:id` | Customer detail and history |
| POST | `/customers/:id/preferences` | Record an email, SMS, WhatsApp, or voice opt-in/out |
| GET | `/cases` | Recovery cases with filters |
| GET | `/cases/stats/summary` | KPI summary |
| GET | `/cases/stats/strategies` | Recovery performance by recommended strategy |
| GET | `/cases/:id` | Case detail with events and AI decision |
| GET | `/simulator/config` | Simulator capabilities |
| POST | `/simulator/events/payment-failure` | Create a failed-payment case |
| POST | `/simulator/events/checkout-abandonment` | Create a checkout-dropoff case |
| POST | `/simulator/events/subscription-failure` | Create a failed-renewal case |
| POST | `/simulator/events/invoice-overdue` | Create an overdue-invoice case |
| POST | `/simulator/batch` | Bulk-generate cases |
| GET | `/ai/provider` | Active diagnosis provider |
| POST | `/ai/diagnose/:caseId` | Diagnose one case |
| POST | `/ai/diagnose/pending` | Diagnose pending `OPEN` cases |
| GET | `/policy/config` | Effective policy limits |
| POST | `/policy/evaluate/:caseId` | Dry-run policy verdict |
| POST | `/cases/:id/execute` | Execute the next action through the policy gate |
| GET | `/verification/pending` | Cases waiting for payment outcome |
| POST | `/verification/customer/:caseId` | Simulate one customer outcome |
| POST | `/verification/batch` | Simulate outcomes across a batch |
| GET | `/ptp` | Promise-to-pay tracker |
| POST | `/ptp/sweep` | Sweep due promises |
| POST | `/ptp/:id/settle` | Manually settle a promise |
| POST | `/voice/simulate-call/:caseId` | Simulated Hinglish voice call |
| POST | `/agent/recover-batch` | Run the bounded recovery agent over a batch |
| POST | `/events/revenue` | Ingest a deduplicated at-risk revenue event |

## Live revenue-event intake

Send trusted backend events to `POST /events/revenue` with the API key. The
`provider` and `eventId` pair is idempotent: retries return the original case
instead of creating duplicate recovery work.

```json
{
  "provider": "billing-platform",
  "eventId": "evt_01JQ9PAYMENTFAILED",
  "type": "PAYMENT_FAILED",
  "sourceReference": "payment_12345",
  "amount": 499,
  "currency": "INR",
  "failureReason": "EXPIRED_CARD",
  "customer": {
    "name": "Demo Customer",
    "email": "demo.customer@example.com"
  }
}
```

## Recovery sequences

`POST /sequences/sweep` progresses active cases through the compliant default
sequence: payment link, 24-hour reminder, 72-hour final reminder, and a
120-hour human escalation. `POST /sequences/run/:caseId` processes one case.
The policy engine still enforces the Indian contact window, cooldown, contact
attempt cap, disputes, and retry limits at every step.

Set `RECOVERY_SEQUENCE_STEPS_JSON` only when a different bounded sequence is
required. It must be a JSON array of up to eight `{label, action, waitHours}`
steps and end with `CREATE_ESCALATION`.

## Resend email delivery

Set `EMAIL_PROVIDER=resend`, `RECOVERY_SEND_LIVE_MESSAGES=true`, `RESEND_API_KEY`,
and a verified `EMAIL_FROM` address to enable approved recovery emails. Register
`POST /webhooks/resend` in Resend with `email.delivered`, `email.opened`,
`email.clicked`, `email.bounced`, `email.failed`, and `email.received`, then set
its signing secret as `RESEND_WEBHOOK_SECRET`. Delivery events are verified,
deduplicated, and written to the linked contact attempt and case timeline.
Set `RESEND_REPLY_TO_DOMAIN` to an inbound-enabled Resend domain to route replies
to `replies+<contact-attempt-id>@your-domain` and track them as `REPLIED`.

## Human approval queue

High-value cases (Rs 50,000+) and high-risk customers (risk score 0.7+) can be
submitted through `POST /approvals/request/:caseId`. Operators use
`POST /approvals/:id/approve` or `/reject` with their identity and optional
edited action. Approval still runs the policy engine before an action executes.

## Customer consent

Before live outreach, record the customer's channel preference. The policy
engine blocks contact actions without an `OPTED_IN` preference and outside the
configured India contact window.

```json
POST /customers/123/preferences
{
  "channel": "EMAIL",
  "status": "OPTED_IN",
  "source": "checkout-consent-v1"
}
```

## Batch agent example

```bash
curl -X POST http://localhost:3002/agent/recover-batch \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 25,
    "verifyWaitingCustomers": true,
    "verificationSuccessRatePct": 60,
    "runPromiseSweep": true
  }'
```

## Production pilot (India)

The repository is safe to deploy in simulated mode by default. For a real pilot,
create separate API and dashboard services from the same repository. Leave the
Railway **Root Directory** blank for both services because they share the root
workspace and `@revrec/shared` package. Set service variables from `.env.example`
and set `WEB_ORIGIN` to the deployed dashboard URL.

### Railway API service

Set these values in the API service's **Settings** tab:

```text
Build Command: npm run build:shared && npm run build --workspace @revrec/api
Pre-Deploy Command: npm run db:deploy
Start Command: npm run start --workspace @revrec/api
Healthcheck Path: /health
```

The repository-level `railway.toml` deliberately specifies only the Railpack
builder. Service-specific commands must remain in Railway because this shared
repository deploys two different applications.

For Razorpay Test Mode, set `PAYMENT_PROVIDER=razorpay` plus the three
`RAZORPAY_*` secrets in Railway. Payment links are mapped to recovery cases and
only a signed `POST /webhooks/razorpay` event can mark money as recovered.
Subscribe to `payment_link.paid`, `payment.failed`, and dispute events in the
Razorpay dashboard. Do not configure live keys until consent, templates, and a
human escalation owner have been approved.

The free options are appropriate for a small pilot only: Railway has limited
monthly free credit, Resend has a capped free transactional-email tier, and
Razorpay Test Mode is free. Live Razorpay payments and SMS/WhatsApp delivery
have usage charges.

### Railway dashboard service

Create a second Railway service from the same GitHub repository for
`@revrec/web`. In its service settings, use these commands:

```text
Build Command: npm run build:shared && npm run build --workspace @revrec/web
Start Command: npm run start --workspace @revrec/web
```

Set these dashboard service variables:

```text
API_URL=https://YOUR-API-DOMAIN.up.railway.app
API_AUTH_TOKEN=the same private token configured on the API service
```

Then set `WEB_ORIGIN=https://YOUR-DASHBOARD-DOMAIN.up.railway.app` on the API
service and redeploy it. The dashboard calls the API server-side, so the token
is never exposed to the browser.

Optional demo helper:

```json
{
  "simulateBatch": {
    "failedPayments": 10,
    "checkoutAbandonments": 5,
    "subscriptionFailures": 4,
    "invoiceOverdues": 3
  }
}
```

The batch response includes:

- cases selected
- cases diagnosed
- policy allows vs denies
- actions executed
- recovered count and amount
- deferred or escalated promise-to-pay outcomes
- per-case outcomes
- post-run KPI snapshot

## Real-world safeguards now implemented

- Terminal cases cannot receive new automated outreach or retries.
- Policy denials caused by contact hours or cooldown defer work instead of forcing escalation.
- Retry denials fall back to safer customer-action flows where possible.
- Verified recovery updates linked invoices and subscriptions, not just the recovery case.
- Promise-to-pay records now generate case events and audit logs.
- Every batch run writes an audit log summary.

## Notes

- The dashboard includes a `Run Batch Agent` button that calls the new orchestration endpoint and refreshes KPI views.
- The default AI provider is deterministic and offline-friendly for local development and testing.
- The web production build may require elevated process permissions in some sandboxed Windows environments.
