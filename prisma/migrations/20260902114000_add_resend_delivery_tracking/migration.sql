ALTER TYPE "ContactStatus" ADD VALUE IF NOT EXISTS 'BOUNCED';

ALTER TABLE "ContactAttempt"
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerMessageId" TEXT;

CREATE UNIQUE INDEX "ContactAttempt_providerMessageId_key"
ON "ContactAttempt"("providerMessageId");
