CREATE TYPE "ConsentStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT');
CREATE TABLE "ContactPreference" (
  "id" SERIAL NOT NULL,
  "customerId" INTEGER NOT NULL,
  "channel" "Channel" NOT NULL,
  "status" "ConsentStatus" NOT NULL DEFAULT 'OPTED_OUT',
  "source" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContactPreference_customerId_channel_key" ON "ContactPreference"("customerId", "channel");
ALTER TABLE "ContactPreference" ADD CONSTRAINT "ContactPreference_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
