# AI Revenue Recovery

AI Revenue Recovery detects money at risk, uses AI to recommend a bounded next
action, applies compliance policy, executes approved recovery work, and records
verified outcomes in an audit trail.

It is designed for an India-focused demo and pilot: failed payments, abandoned
checkouts, subscription failures, overdue invoices, payment links, email
recovery, promise-to-pay tracking, human approval, and recovery analytics.

## What Happens In A Recovery

1. A billing platform, simulator, or dashboard Test Lab creates an `OPEN` recovery case.
2. Gemini analyzes the case and recommends one allowed action.
3. The policy engine checks customer consent, contact hours in India, cooldowns,
   contact limits, retry limits, and dispute stops.
4. An allowed action creates a payment link, schedules a retry, sends a message,
   or escalates to a person.
5. Only a signed Razorpay webhook can mark a real payment as recovered.
6. Every event, policy decision, action, approval, and verification is written
   to the case timeline and audit log.

AI recommends. Policy controls. Payment-provider webhooks verify money.

## Stack

| Layer | Technology |
| --- | --- |
| Dashboard | Next.js, React, TypeScript, Tailwind CSS |
| API | NestJS, TypeScript |
| Data | PostgreSQL, Prisma |
| Jobs | Redis, BullMQ (optional) |
| AI | Gemini API, with deterministic mock fallback |
| Payments | Razorpay Payment Links and signed webhooks |
| Email | Resend and signed webhooks |
| Deployment | Railway |

## Local Setup

```bash
npm install
npm run db:up
npm run db:deploy
npm run db:seed
```

Copy `.env.example` to `.env`, then start each service in its own terminal:

```bash
npm run dev:api
npm run dev:web
```

- API: `http://localhost:3002/health`
- Dashboard: `http://localhost:3100`

The API root URL intentionally returns `404`. Use `/health` to check it.

## Environment Variables

Use `.env.example` as the complete template. Never commit `.env` or provider
secrets.

### Required For A Deployed API

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
API_AUTH_TOKEN=a-long-random-secret
WEB_ORIGIN=https://your-dashboard.up.railway.app
```

`API_AUTH_TOKEN` protects all API routes except `/health` and signed provider
webhooks. The dashboard uses it only on the server; do not expose it in browser
code or variables prefixed with `NEXT_PUBLIC_`.

### AI: Gemini

```env
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.7-flash
```

When `GEMINI_API_KEY` is present, the API uses real Gemini diagnosis. When it
is absent, the API uses `mock-gemini`, deterministic local reasoning suitable
for offline development and demos.

The Gemini key belongs only in the Railway API service. If diagnosis fails,
the Test Lab now reports a safe provider status: `401`/`403` means check the
key and Google AI Studio permissions, `404` means check `GEMINI_MODEL`, and
`429` means the key has no remaining quota. Railway API logs retain the provider
response for troubleshooting without exposing it to dashboard users.

### Payments: Razorpay

```env
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Use Razorpay Test Mode for the demo. Register this API webhook and subscribe to
payment-link payment events:

```text
https://YOUR-API-DOMAIN.up.railway.app/webhooks/razorpay
```

The system stores each provider link against its recovery case. It does not
trust a browser redirect or a customer statement as proof of payment. Only a
valid signed Razorpay webhook updates a case to `RECOVERED`.

Set `PAYMENT_PROVIDER=simulated` when you do not want a real Razorpay test link.

### Email: Resend

```env
EMAIL_PROVIDER=resend
RECOVERY_SEND_LIVE_MESSAGES=true
RESEND_API_KEY=re_...
EMAIL_FROM=AI Revenue Recovery <recover@notify.yourdomain.com>
RESEND_WEBHOOK_SECRET=whsec_...
RESEND_REPLY_TO_DOMAIN=reply.yourdomain.com
```

For real customer email, verify a domain you control in Resend and use an
address at that domain for `EMAIL_FROM`. Configure the Resend webhook:

```text
https://YOUR-API-DOMAIN.up.railway.app/webhooks/resend
```

Select `email.sent`, `email.delivered`, `email.opened`, `email.clicked`,
`email.bounced`, `email.failed`, and `email.received`. The application verifies
the webhook signature, deduplicates events, and updates contact-attempt status.

For a free personal test, use:

```env
EMAIL_FROM=AI Revenue Recovery <onboarding@resend.dev>
```

Resend permits that sender to email only the address associated with the Resend
account. Use a verified domain before sending recovery email to any other user.

Keep the safe defaults below until delivery is intentionally enabled:

```env
EMAIL_PROVIDER=simulated
RECOVERY_SEND_LIVE_MESSAGES=false
```

### Policy And Job Controls

```env
CONTACT_WINDOW_START_IST=9
CONTACT_WINDOW_END_IST=20
PTP_REMINDER_LEAD_HOURS=24
BACKGROUND_JOBS_ENABLED=false
RECOVERY_SEQUENCE_STEPS_JSON=""
```

The policy engine denies contact without an `OPTED_IN` customer preference. It
also blocks outreach outside the configured IST window and applies contact and
retry limits. Keep background jobs disabled for a hackathon demo unless a Redis
worker schedule is intentionally configured.

## Dashboard Test Lab

The dashboard has a no-PowerShell Test Lab for a private hackathon demo. Enable
it on the Railway **dashboard service**, not the API service:

```env
DEMO_MODE=true
DEMO_ACCESS_TOKEN=a-long-random-private-demo-secret
```

The Test Lab can create test cases, run AI diagnosis, record demo email consent,
execute the recommended action, simulate Hinglish voice responses, and simulate
payment verification.

Set the same values below on the Railway **API service** for a private demo only:

```env
DEMO_ACCESS_TOKEN=a-long-random-private-demo-secret
ALLOW_SIMULATED_VERIFICATION=true
```

Enter `DEMO_ACCESS_TOKEN` in the Test Lab before using any control. It is not a
public dashboard password and must not be shared in a presentation or committed
to Git. Mock payment verification is disabled by default, including in
production; real recovered money can only come from a signed Razorpay webhook.

Use this order:

1. Enter a test name and email, or leave both empty for synthetic data.
2. Click **Create Test Case**.
3. If reusing a previous case ID, enter it and click **Load Case** first. This
   loads its correct customer before recording consent.
4. Click **Grant Demo Email Consent**.
5. Click **Run AI Diagnosis**.
6. Click **Execute Recommended Action**.
7. If Gemini is temporarily unavailable, use **Send Test Payment Link** as an
   operator-approved demo override. It still applies consent, contact-hour,
   cooldown, and attempt-limit policy.
8. For a Razorpay test link, open the link shown in the execution result and
   complete the payment in Razorpay Test Mode.
9. Click **Mock Payment Success** only for a simulation-only outcome and only
   as the final step because it closes the case as `RECOVERED`.

Run contact actions during the configured India contact window. A policy denial
is expected behavior, not an application error.

Set `DEMO_MODE=false` and `ALLOW_SIMULATED_VERIFICATION=false` before real
customer use. The Test Lab deliberately has powerful test controls and must not
remain publicly available in production.

## Customer Consent

Record consent before any real contact action:

```text
POST /customers/:id/preferences
```

```json
{
  "channel": "EMAIL",
  "status": "OPTED_IN",
  "source": "checkout-consent-v1"
}
```

Supported channels are `EMAIL`, `SMS`, `WHATSAPP`, and `VOICE`. Preference
changes are written to the audit log.

## Voice Calling

The current voice feature is a transcript simulator, not a phone provider. Use
`POST /voice/simulate-call/:caseId` or the Test Lab to test Hinglish intents.

| Transcript intent | Current behavior |
| --- | --- |
| Promise to pay | Creates a promise-to-pay record and waits for the date |
| Customer says payment is complete | Records a payment claim and waits for Razorpay verification |
| Customer refuses payment | Escalates the case to a human |
| Unclear response | Records no outbound action and requires human review |

Automatic calling is intentionally not implemented. Before connecting Twilio or
another provider, implement explicit voice consent, a recording disclosure,
contact-hour enforcement, human handoff, and provider-specific compliance.

## Promise To Pay

Voice or operator inputs can create a promise-to-pay record. `POST /ptp/sweep`
processes commitments: it sends one policy-approved reminder when due and then
escalates an unpaid broken promise to a human. A pre-due reminder is sent within
`PTP_REMINDER_LEAD_HOURS` when policy permits it.

## Recovery Sequences And Approvals

`POST /sequences/sweep` processes the default bounded sequence:

1. Payment link
2. 24-hour reminder
3. 72-hour final reminder
4. 120-hour human escalation

Every sequence step runs through the policy engine. Customize the sequence only
with `RECOVERY_SEQUENCE_STEPS_JSON`; it accepts at most eight steps and must end
in `CREATE_ESCALATION`.

High-value cases (INR 50,000 or more) and high-risk customers can be submitted
to the approval queue with `POST /approvals/request/:caseId`. An operator can
approve, reject, or amend an action. Approval does not bypass policy.

## Live Revenue Event Intake

Send trusted server-side billing events to `POST /events/revenue` with the API
key. The `(provider, eventId)` pair is idempotent, so retrying the same event
returns the original case instead of creating duplicate recovery work.

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

## Main API Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | API and database readiness |
| GET | `/cases` | List recovery cases |
| GET | `/cases/:id` | Case, timeline, decisions, attempts, and links |
| POST | `/events/revenue` | Ingest one deduplicated revenue-risk event |
| POST | `/simulator/events/payment-failure` | Create a synthetic payment failure |
| POST | `/simulator/batch` | Create a synthetic batch |
| GET | `/ai/provider` | Show `gemini` or `mock-gemini` |
| POST | `/ai/diagnose/:caseId` | Run one AI diagnosis |
| POST | `/cases/:id/execute` | Policy-gate and execute recommendation or supplied action |
| POST | `/verification/customer/:caseId` | Simulation-only payment outcome |
| POST | `/voice/simulate-call/:caseId` | Simulated Hinglish voice transcript |
| GET, POST | `/ptp`, `/ptp/sweep` | Promise-to-pay tracking and sweep |
| GET, POST | `/approvals/pending`, `/approvals/...` | Human approval queue |
| GET | `/analytics/recovery` | Recovered amount by cause, channel, action, and date |
| POST | `/agent/recover-batch` | Bounded batch orchestration |

## Railway Deployment

Deploy two Railway services from the same repository. Leave **Root Directory**
blank for both because the shared workspace package is required by API and web.

### API Service

```text
Build Command: npm run build:shared && npm run build --workspace @revrec/api
Pre-Deploy Command: npm run db:deploy
Start Command: npm run start --workspace @revrec/api
Healthcheck Path: /health
```

Add PostgreSQL and Redis services. Set `DATABASE_URL=${{Postgres.DATABASE_URL}}`
and `REDIS_URL=${{Redis.REDIS_URL}}`, then add the API environment variables
listed above. Deploy API first and confirm:

```text
https://YOUR-API-DOMAIN.up.railway.app/health
```

### Dashboard Service

```text
Build Command: npm run build:shared && npm run build --workspace @revrec/web
Start Command: npm run start --workspace @revrec/web
```

Set:

```env
API_URL=https://YOUR-API-DOMAIN.up.railway.app
API_AUTH_TOKEN=the-same-private-token-as-the-api
DEMO_MODE=true
```

After Railway generates the dashboard URL, set `WEB_ORIGIN` on the API service
to that exact URL and redeploy the API. Then set `DEMO_MODE=false` when the
private demonstration is complete.

## Production Checklist

- Use new, private API, Razorpay, Resend, and Gemini secrets in Railway.
- Confirm `/health` returns `status: ok` after deployment.
- Set the exact deployed dashboard URL in `WEB_ORIGIN`.
- Configure and test signed Razorpay webhooks before enabling live payments.
- Obtain customer consent before enabling live email or any future calling.
- Verify a Resend domain before emailing anyone other than the Resend account owner.
- Keep `RECOVERY_SEND_LIVE_MESSAGES=false` until templates and consent are reviewed.
- Keep `DEMO_MODE=false` outside a private demo.
- Keep `ALLOW_SIMULATED_VERIFICATION=false` outside a private demo.
- Do not enable automatic calling until a compliant provider and human handoff are ready.
- Use the provider dashboard and case audit trail to verify every real recovery.

## Security Boundaries

- API key protection covers operational endpoints.
- Razorpay and Resend webhooks verify provider signatures and deduplicate events.
- Email and payment links are policy-gated by consent, contact window, cooldown,
  and attempt limits.
- Terminal cases cannot receive new automated recovery work.
- A payment statement in a voice transcript is not a payment verification.
- Audit logs retain the actor, decision, action, and relevant metadata.
