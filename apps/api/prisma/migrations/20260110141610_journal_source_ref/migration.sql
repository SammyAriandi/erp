/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,sourceType,sourceId]` on the table `JournalEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_tenantId_sourceType_sourceId_key" ON "JournalEntry"("tenantId", "sourceType", "sourceId");
