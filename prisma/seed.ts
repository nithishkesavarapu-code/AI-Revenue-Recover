/**
 * Seed script — creates a realistic synthetic dataset:
 * customers with payment history, subscriptions, invoices,
 * recovery cases across all five scenario types, AI decisions,
 * case timeline events and audit logs.
 *
 * Run: npm run db:seed
 */
import "dotenv/config";
import { PrismaClient, CaseType, CaseStatus, Priority, FailureReason, PaymentStatus, Recoverability, RecommendedAction } from "@prisma/client";

const prisma = new PrismaClient();

const daysAgo = (n: number, h = 0) => new Date(Date.now() - n * 86_400_000 + h * 3_600_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  console.log("Clearing existing data...");
  await prisma.auditLog.deleteMany();
  await prisma.contactAttempt.deleteMany();
  await prisma.caseEvent.deleteMany();
  await prisma.aiDecision.deleteMany();
  await prisma.promiseToPay.deleteMany();
  await prisma.recoveryCase.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();

  console.log("Creating customers...");
  const customerData = [
    { name: "Rahul Sharma", email: "rahul.sharma@gmail.com", phone: "+91 98200 11223", company: null },
    { name: "Priya Patel", email: "priya.patel@gmail.com", phone: "+91 99870 44556", company: null },
    { name: "Arjun Mehta", email: "arjun.mehta@outlook.com", phone: "+91 90040 77889", company: null },
    { name: "Sneha Reddy", email: "sneha.reddy@gmail.com", phone: "+91 91230 33445", company: null },
    { name: "Vikram Singh", email: "vikram.singh@yahoo.com", phone: "+91 98110 99001", company: null },
    { name: "Ananya Iyer", email: "ananya.iyer@gmail.com", phone: "+91 99450 66778", company: null },
    { name: "Karan Malhotra", email: "karan.malhotra@hotmail.com", phone: "+91 98765 12345", company: null },
    { name: "Deepa Nair", email: "deepa.nair@gmail.com", phone: "+91 97400 55667", company: null },
    { name: "Rohit Deshmukh", email: "finance@abcltd.in", phone: "+91 22 4000 1000", company: "ABC Ltd" },
    { name: "Meera Krishnan", email: "accounts@xyzbiz.com", phone: "+91 80 2500 2000", company: "XYZ Biz Pvt Ltd" },
    { name: "Sanjay Gupta", email: "ap@techsol.co.in", phone: "+91 11 4300 3000", company: "TechSol Enterprises" },
    { name: "Lakshmi Rao", email: "billing@globaltraders.in", phone: "+91 40 2300 4000", company: "Global Traders" },
  ];

  const customers: Record<string, number> = {};
  for (const c of customerData) {
    const created = await prisma.customer.create({
      data: {
        ...c,
        riskScore: Math.round(Math.random() * 40) / 100,
      },
    });
    customers[c.email] = created.id;
  }

  console.log("Creating payment history...");
  type PaymentSeed = {
    email: string; amount: number; status: PaymentStatus;
    failureReason?: FailureReason; daysBack: number;
  };
  const paymentSeeds: PaymentSeed[] = [
    // Rahul — 6 successful payments then expired card (guide scenario 4.1)
    ...Array.from({ length: 6 }, (_, i) => ({ email: "rahul.sharma@gmail.com", amount: 999, status: PaymentStatus.SUCCESS, daysBack: 210 - i * 30 })),
    { email: "rahul.sharma@gmail.com", amount: 999, status: PaymentStatus.FAILED, failureReason: FailureReason.EXPIRED_CARD, daysBack: 2 },
    // Priya — insufficient funds
    ...Array.from({ length: 4 }, (_, i) => ({ email: "priya.patel@gmail.com", amount: 1499, status: PaymentStatus.SUCCESS, daysBack: 150 - i * 35 })),
    { email: "priya.patel@gmail.com", amount: 1499, status: PaymentStatus.FAILED, failureReason: FailureReason.INSUFFICIENT_FUNDS, daysBack: 4 },
    { email: "priya.patel@gmail.com", amount: 1499, status: PaymentStatus.RETRY_SCHEDULED, daysBack: 3 },
    // Arjun — bank declined
    ...Array.from({ length: 5 }, (_, i) => ({ email: "arjun.mehta@outlook.com", amount: 2499, status: PaymentStatus.SUCCESS, daysBack: 170 - i * 32 })),
    { email: "arjun.mehta@outlook.com", amount: 2499, status: PaymentStatus.FAILED, failureReason: FailureReason.DECLINED_BY_BANK, daysBack: 1 },
    // Sneha — auth failure
    ...Array.from({ length: 3 }, (_, i) => ({ email: "sneha.reddy@gmail.com", amount: 999, status: PaymentStatus.SUCCESS, daysBack: 120 - i * 40 })),
    { email: "sneha.reddy@gmail.com", amount: 999, status: PaymentStatus.FAILED, failureReason: FailureReason.AUTHENTICATION_FAILED, daysBack: 6 },
    // Vikram — technical error
    { email: "vikram.singh@yahoo.com", amount: 4999, status: PaymentStatus.SUCCESS, daysBack: 60 },
    { email: "vikram.singh@yahoo.com", amount: 4999, status: PaymentStatus.FAILED, failureReason: FailureReason.TECHNICAL_ERROR, daysBack: 5 },
    // Ananya / Karan / Deepa healthy history
    ...Array.from({ length: 4 }, (_, i) => ({ email: "ananya.iyer@gmail.com", amount: 1999, status: PaymentStatus.SUCCESS, daysBack: 140 - i * 35 })),
    ...Array.from({ length: 2 }, (_, i) => ({ email: "karan.malhotra@hotmail.com", amount: 2999, status: PaymentStatus.SUCCESS, daysBack: 70 - i * 31 })),
    { email: "karan.malhotra@hotmail.com", amount: 2999, status: PaymentStatus.FAILED, failureReason: FailureReason.EXPIRED_CARD, daysBack: 3 },
    { email: "deepa.nair@gmail.com", amount: 999, status: PaymentStatus.SUCCESS, daysBack: 45 },
  ];

  let refSeq = 1000;
  for (const p of paymentSeeds) {
    await prisma.payment.create({
      data: {
        customerId: customers[p.email]!,
        amount: p.amount,
        status: p.status,
        failureReason: p.failureReason ?? null,
        reference: `pay_sim_${refSeq++}`,
        createdAt: daysAgo(p.daysBack),
        updatedAt: daysAgo(p.daysBack),
      },
    });
  }

  console.log("Creating subscriptions and invoices...");
  await prisma.subscription.create({
    data: { customerId: customers["rahul.sharma@gmail.com"]!, plan: "monthly", amount: 999, renewalDate: daysAgo(2), status: "PAST_DUE" },
  });
  await prisma.subscription.create({
    data: { customerId: customers["priya.patel@gmail.com"]!, plan: "yearly", amount: 24000, renewalDate: daysAgo(4), status: "PAST_DUE" },
  });
  await prisma.subscription.create({
    data: { customerId: customers["arjun.mehta@outlook.com"]!, plan: "monthly", amount: 2499, renewalDate: daysAhead(25), status: "ACTIVE" },
  });
  await prisma.subscription.create({
    data: { customerId: customers["karan.malhotra@hotmail.com"]!, plan: "yearly", amount: 36000, renewalDate: daysAgo(3), status: "PAST_DUE" },
  });

  const invoiceSeeds = [
    { email: "finance@abcltd.in", number: "INV-1024", amount: 500000, dueBack: 7, paid: false },
    { email: "accounts@xyzbiz.com", number: "INV-1025", amount: 125000, dueBack: 12, paid: false },
    { email: "ap@techsol.co.in", number: "INV-1026", amount: 340000, dueBack: 3, paid: false },
    { email: "billing@globaltraders.in", number: "INV-1027", amount: 85000, dueBack: 20, paid: true },
  ];
  for (const inv of invoiceSeeds) {
    await prisma.invoice.create({
      data: {
        customerId: customers[inv.email]!,
        number: inv.number,
        amount: inv.amount,
        dueDate: daysAgo(inv.dueBack),
        status: inv.paid ? "PAID" : "OVERDUE",
        paidAt: inv.paid ? daysAgo(18) : null,
        createdAt: daysAgo(inv.dueBack + 20),
      },
    });
  }

  console.log("Creating recovery cases...");
  interface CaseSeed {
    email: string; type: CaseType; amountAtRisk: number;
    reason: string; status: CaseStatus; priority: Priority;
    recommendedAction?: RecommendedAction; recoveredAmount?: number;
    daysBack: number;
    ai?: { classification: string; rootCause: string; recoverability: Recoverability; confidence: number };
    events: Array<{ type: string; message: string; dayOffset: number }>;
  }

  const caseSeeds: CaseSeed[] = [
    {
      email: "rahul.sharma@gmail.com", type: "FAILED_PAYMENT", amountAtRisk: 999,
      reason: "Card expired after 6 successful payments", status: "WAITING_CUSTOMER", priority: "HIGH",
      recommendedAction: RecommendedAction.SEND_PAYMENT_UPDATE_LINK, daysBack: 2,
      ai: { classification: "payment_method_issue", rootCause: "expired_card", recoverability: Recoverability.HIGH, confidence: 0.94 },
      events: [
        { type: "DETECTED", message: "Payment of ₹999 failed (expired_card)", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: high recoverability — strong history, expired card", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Payment-method update link sent via email", dayOffset: 0 },
      ],
    },
    {
      email: "priya.patel@gmail.com", type: "FAILED_PAYMENT", amountAtRisk: 1499,
      reason: "Insufficient funds at first attempt", status: "ACTION_TAKEN", priority: "MEDIUM",
      recommendedAction: RecommendedAction.SCHEDULE_RETRY, daysBack: 4,
      ai: { classification: "temporary_shortfall", rootCause: "insufficient_funds", recoverability: Recoverability.HIGH, confidence: 0.88 },
      events: [
        { type: "DETECTED", message: "Payment of ₹1,499 failed (insufficient_funds)", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: temporary shortfall — retry in 48h likely to succeed", dayOffset: 0 },
        { type: "POLICY_DECISION", message: "Policy: ALLOW retry (attempt 2/4)", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Retry scheduled for next business day", dayOffset: 1 },
      ],
    },
    {
      email: "arjun.mehta@outlook.com", type: "FAILED_PAYMENT", amountAtRisk: 2499,
      reason: "Bank declined the transaction", status: "RECOVERED", priority: "HIGH",
      recommendedAction: RecommendedAction.SEND_PAYMENT_LINK, recoveredAmount: 2499, daysBack: 8,
      ai: { classification: "bank_decline", rootCause: "declined_by_bank", recoverability: Recoverability.MEDIUM, confidence: 0.72 },
      events: [
        { type: "DETECTED", message: "Payment of ₹2,499 failed (declined_by_bank)", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: medium recoverability — link preferred over auto-retry", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Secure payment link sent via email", dayOffset: 0 },
        { type: "PAYMENT_VERIFIED", message: "Customer completed payment — ₹2,499 received", dayOffset: 2 },
        { type: "CLOSED", message: "Case closed as RECOVERED", dayOffset: 2 },
      ],
    },
      {
      email: "sneha.reddy@gmail.com", type: "FAILED_SUBSCRIPTION", amountAtRisk: 999,
      reason: "UPI mandate authentication failed at renewal", status: "ESCALATED", priority: "CRITICAL",
      recommendedAction: RecommendedAction.CREATE_ESCALATION, daysBack: 9,
      ai: { classification: "mandate_issue", rootCause: "authentication_failed", recoverability: Recoverability.LOW, confidence: 0.41 },
      events: [
        { type: "DETECTED", message: "Subscription renewal of ₹999 failed (authentication_failed)", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: low recoverability — mandate needs re-authentication", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Reminder SMS sent", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Second reminder sent (final permitted attempt)", dayOffset: 5 },
        { type: "ESCALATED", message: "No response after max contact attempts — escalated to human agent", dayOffset: 7 },
      ],
    },
    {
      email: "karan.malhotra@hotmail.com", type: "FAILED_SUBSCRIPTION", amountAtRisk: 36000,
      reason: "Corporate card expired before yearly renewal", status: "WAITING_CUSTOMER", priority: "HIGH",
      recommendedAction: RecommendedAction.SEND_PAYMENT_UPDATE_LINK, daysBack: 3,
      ai: { classification: "payment_method_issue", rootCause: "expired_card", recoverability: Recoverability.HIGH, confidence: 0.91 },
      events: [
        { type: "DETECTED", message: "Yearly renewal of ₹36,000 failed (expired_card)", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: high recoverability — expired corporate card", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Payment-update link sent to billing contact", dayOffset: 0 },
      ],
    },
    {
      email: "finance@abcltd.in", type: "OVERDUE_INVOICE", amountAtRisk: 500000,
      reason: "INV-1024 overdue — no dispute on record, historically reliable payer", status: "WAITING_CUSTOMER", priority: "CRITICAL",
      recommendedAction: RecommendedAction.SEND_EMAIL, daysBack: 7,
      ai: { classification: "receivables_delay", rootCause: "internal_processing_delay", recoverability: Recoverability.HIGH, confidence: 0.85 },
      events: [
        { type: "DETECTED", message: "Invoice INV-1024 (₹5,00,000) is 7 days overdue", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: reliable payer, no dispute — send polite finance reminder", dayOffset: 0 },
        { type: "POLICY_DECISION", message: "Policy: ALLOW (within contact limits, no dispute flag)", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Polite reminder emailed to finance team", dayOffset: 0 },
      ],
    },
    {
      email: "accounts@xyzbiz.com", type: "OVERDUE_INVOICE", amountAtRisk: 125000,
      reason: "INV-1025 overdue — promised to pay by end of week", status: "ACTION_TAKEN", priority: "HIGH",
      recommendedAction: RecommendedAction.SEND_EMAIL, daysBack: 12,
      ai: { classification: "receivables_delay", rootCause: "cash_flow_timing", recoverability: Recoverability.MEDIUM, confidence: 0.68 },
      events: [
        { type: "DETECTED", message: "Invoice INV-1025 (₹1,25,000) is 12 days overdue", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: cash-flow timing delay — schedule follow-up", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Follow-up scheduled after promised date", dayOffset: 1 },
      ],
    },
      {
      email: "ap@techsol.co.in", type: "OVERDUE_INVOICE", amountAtRisk: 340000,
      reason: "INV-1026 recently overdue — first reminder pending", status: "OPEN", priority: "HIGH",
      daysBack: 3,
      events: [{ type: "DETECTED", message: "Invoice INV-1026 (₹3,40,000) is 3 days overdue", dayOffset: 0 }],
    },
    {
      email: "vikram.singh@yahoo.com", type: "CHECKOUT_ABANDONMENT", amountAtRisk: 80000,
      reason: "Reached checkout for ₹80,000 order, dropped off at payment step", status: "RECOVERED", priority: "MEDIUM",
      recommendedAction: RecommendedAction.SEND_PAYMENT_LINK, recoveredAmount: 80000, daysBack: 14,
      ai: { classification: "checkout_dropoff", rootCause: "payment_step_friction", recoverability: Recoverability.MEDIUM, confidence: 0.63 },
      events: [
        { type: "DETECTED", message: "Checkout abandoned at payment step — cart value ₹80,000", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: payment friction — send one-click checkout link", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Recovery email with cart link sent", dayOffset: 0 },
        { type: "PAYMENT_VERIFIED", message: "Customer completed purchase — ₹80,000 received", dayOffset: 1 },
        { type: "CLOSED", message: "Case closed as RECOVERED", dayOffset: 1 },
      ],
    },
    {
      email: "deepa.nair@gmail.com", type: "CHECKOUT_ABANDONMENT", amountAtRisk: 12499,
      reason: "Abandoned cart after comparing prices", status: "WAITING_CUSTOMER", priority: "LOW",
      recommendedAction: RecommendedAction.SEND_EMAIL, daysBack: 5,
      ai: { classification: "price_comparison", rootCause: "customer_dropoff", recoverability: Recoverability.LOW, confidence: 0.35 },
      events: [
        { type: "DETECTED", message: "Cart worth ₹12,499 abandoned", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: low intent signal — single gentle nudge only", dayOffset: 0 },
        { type: "ACTION_EXECUTED", message: "Single recovery email sent (no follow-up per policy)", dayOffset: 0 },
      ],
    },
    {
      email: "priya.patel@gmail.com", type: "MANDATE_FAILURE", amountAtRisk: 3000,
      reason: "Auto-debit mandate failed — temporary bank issue", status: "DIAGNOSED", priority: "MEDIUM",
      daysBack: 1,
      ai: { classification: "mandate_issue", rootCause: "technical_error", recoverability: Recoverability.HIGH, confidence: 0.79 },
      events: [
        { type: "DETECTED", message: "₹3,000 auto-debit failed (technical_error)", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: temporary bank issue — controlled retry sequence started (Day 1 retry queued)", dayOffset: 0 },
      ],
    },
    {
      email: "ananya.iyer@gmail.com", type: "FAILED_PAYMENT", amountAtRisk: 1999,
      reason: "One-time network timeout during payment", status: "RECOVERED", priority: "LOW",
      recommendedAction: RecommendedAction.RETRY_PAYMENT, recoveredAmount: 1999, daysBack: 21,
      ai: { classification: "technical_issue", rootCause: "technical_error", recoverability: Recoverability.HIGH, confidence: 0.96 },
      events: [
        { type: "DETECTED", message: "Payment of ₹1,999 failed (technical_error)", dayOffset: 0 },
        { type: "DIAGNOSED", message: "AI: transient gateway error — immediate retry allowed", dayOffset: 0 },
        { type: "POLICY_DECISION", message: "Policy: ALLOW retry (attempt 2/4)", dayOffset: 0 },
        { type: "PAYMENT_VERIFIED", message: "Retry succeeded — ₹1,999 received", dayOffset: 0 },
        { type: "CLOSED", message: "Case closed as RECOVERED", dayOffset: 0 },
      ],
    },
  ];

  for (const cs of caseSeeds) {
    const created = await prisma.recoveryCase.create({
      data: {
        customerId: customers[cs.email]!,
        type: cs.type,
        amountAtRisk: cs.amountAtRisk,
        reason: cs.reason,
        status: cs.status,
        priority: cs.priority,
        recommendedAction: cs.recommendedAction ?? null,
        recoveredAmount: cs.recoveredAmount ?? null,
        createdAt: daysAgo(cs.daysBack),
        updatedAt: daysAgo(cs.daysBack),
        closedAt: cs.status === "RECOVERED" ? daysAgo(Math.max(0, cs.daysBack - (cs.events.at(-1)?.dayOffset ?? 0))) : null,
      },
    });

    if (cs.ai) {
      await prisma.aiDecision.create({
        data: {
          caseId: created.id,
          classification: cs.ai.classification,
          rootCause: cs.ai.rootCause,
          recoverability: cs.ai.recoverability,
          recommendedAction: (cs.recommendedAction ?? RecommendedAction.NO_ACTION) as RecommendedAction,
          confidence: cs.ai.confidence,
          reason: cs.reason,
          provider: "mock-gemini",
          model: "simulated-reasoning-v1",
          createdAt: daysAgo(cs.daysBack),
        },
      });
    }

    for (const ev of cs.events) {
      await prisma.caseEvent.create({
        data: {
          caseId: created.id,
          type: ev.type,
          message: ev.message,
          createdAt: daysAgo(cs.daysBack - ev.dayOffset, 10),
        },
      });
    }

    if (cs.status === "ESCALATED") {
      await prisma.contactAttempt.create({
        data: { caseId: created.id, channel: "SMS", status: "DELIVERED", content: "Final reminder", sentAt: daysAgo(cs.daysBack - 5) },
      });
    }
  }

  console.log("Creating audit logs...");
  const auditEntries = [
    { actor: "system", action: "SEED_DATABASE", entityType: "database" },
    { actor: "system", action: "SIMULATE_PAYMENT_FAILURES", entityType: "payment" },
    { actor: "ai-agent", action: "BATCH_DIAGNOSIS", entityType: "recovery_case" },
    { actor: "policy-engine", action: "VALIDATE_ACTIONS", entityType: "recovery_case" },
  ];
  for (const a of auditEntries) {
    await prisma.auditLog.create({ data: a });
  }




  const counts = {
    customers: await prisma.customer.count(),
    payments: await prisma.payment.count(),
    subscriptions: await prisma.subscription.count(),
    invoices: await prisma.invoice.count(),
    recoveryCases: await prisma.recoveryCase.count(),
    aiDecisions: await prisma.aiDecision.count(),
    caseEvents: await prisma.caseEvent.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
