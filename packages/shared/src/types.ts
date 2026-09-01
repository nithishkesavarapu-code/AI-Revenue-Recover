import type { CaseType, CaseStatus, Priority, RecommendedAction } from "./enums";

/** Summary metrics shown on the dashboard KPI cards. */
export interface StatsSummary {
  totalAtRisk: number;
  totalRecovered: number;
  recoveryRatePct: number;
  totalCases: number;
  activeCases: number;
  waitingCustomer: number;
  humanReview: number;
  recoveredCases: number;
  byType: Array<{
    type: CaseType;
    cases: number;
    atRisk: number;
    recovered: number;
  }>;
}

/** Case row as returned by GET /cases (Decimal fields serialized as strings). */
export interface ApiCaseListItem {
  id: number;
  type: CaseType;
  amountAtRisk: string;
  currency: string;
  reason: string | null;
  status: CaseStatus;
  priority: Priority;
  recommendedAction: RecommendedAction | null;
  recoveredAmount: string | null;
  createdAt: string;
  customer: {
    id: number;
    name: string;
    company: string | null;
    email: string;
  };
  aiDecision: {
    rootCause: string | null;
    recoverability: string;
    recommendedAction: RecommendedAction;
    confidence: number;
  } | null;
}

/** Full AI decision as returned on the case-detail endpoint. */
export interface ApiAiDecision {
  id: number;
  caseId: number;
  classification: string;
  rootCause: string | null;
  recoverability: string;
  recommendedAction: RecommendedAction;
  confidence: number;
  reason: string;
  provider: string;
  model: string | null;
  createdAt: string;
}

/** One entry of the case timeline. */
export interface ApiCaseEvent {
  id: number;
  type: string;
  message: string;
  metadata: unknown;
  createdAt: string;
}

/** Outbound contact (email/SMS/link) recorded on a case. */
export interface ApiContactAttempt {
  id: number;
  channel: "EMAIL" | "SMS" | "WHATSAPP" | "VOICE";
  status: string;
  content: string | null;
  sentAt: string;
}

/** Full case detail returned by GET /cases/:id. */
export interface ApiCaseDetail {
  id: number;
  customerId: number;
  type: CaseType;
  amountAtRisk: string;
  currency: string;
  reason: string | null;
  status: CaseStatus;
  priority: Priority;
  recommendedAction: RecommendedAction | null;
  recoveredAmount: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  customer: {
    id: number;
    name: string;
    company: string | null;
    email: string;
    phone: string | null;
  };
  aiDecision: ApiAiDecision | null;
  events: ApiCaseEvent[];
  contactAttempts: ApiContactAttempt[];
}


/** Simple health payload from GET /health. */
export interface HealthResponse {
  status: "ok";
  service: string;
  time: string;
}
