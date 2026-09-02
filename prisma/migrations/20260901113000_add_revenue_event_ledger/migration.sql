CREATE TABLE "RevenueEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "caseId" INTEGER,

    CONSTRAINT "RevenueEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueEvent_provider_eventId_key" ON "RevenueEvent"("provider", "eventId");
CREATE INDEX "RevenueEvent_eventType_receivedAt_idx" ON "RevenueEvent"("eventType", "receivedAt");
CREATE INDEX "RevenueEvent_caseId_idx" ON "RevenueEvent"("caseId");

ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
