-- CreateEnum
CREATE TYPE "PtpStatus" AS ENUM ('RECORDED', 'FOLLOWED_UP', 'FULFILLED', 'BROKEN');

-- CreateTable
CREATE TABLE "PromiseToPay" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "promisedOn" TIMESTAMP(3) NOT NULL,
    "status" "PtpStatus" NOT NULL DEFAULT 'RECORDED',
    "source" "Channel" NOT NULL DEFAULT 'VOICE',
    "transcript" TEXT,
    "followUps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromiseToPay_caseId_key" ON "PromiseToPay"("caseId");

-- AddForeignKey
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
