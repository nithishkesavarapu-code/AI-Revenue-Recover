-- Provider links are stored separately so webhook verification can always map
-- an externally generated payment to exactly one recovery case.
CREATE TABLE "PaymentLink" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerLinkId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderWebhookEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failure" TEXT,
    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentLink_providerLinkId_key" ON "PaymentLink"("providerLinkId");
CREATE UNIQUE INDEX "PaymentLink_referenceId_key" ON "PaymentLink"("referenceId");
CREATE INDEX "PaymentLink_caseId_provider_idx" ON "PaymentLink"("caseId", "provider");
CREATE UNIQUE INDEX "ProviderWebhookEvent_provider_eventId_key" ON "ProviderWebhookEvent"("provider", "eventId");
CREATE INDEX "ProviderWebhookEvent_provider_eventType_idx" ON "ProviderWebhookEvent"("provider", "eventType");

ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
