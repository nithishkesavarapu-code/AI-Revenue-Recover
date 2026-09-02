CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ApprovalRequest" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "requestedAction" "RecommendedAction" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL DEFAULT 'recovery-agent',
    "reason" TEXT NOT NULL,
    "reviewedAction" "RecommendedAction",
    "reviewedBy" TEXT,
    "reviewerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");
CREATE INDEX "ApprovalRequest_caseId_idx" ON "ApprovalRequest"("caseId");
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
