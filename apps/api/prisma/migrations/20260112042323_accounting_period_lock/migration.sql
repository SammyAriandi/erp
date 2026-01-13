-- CreateTable
CREATE TABLE "AccountingPeriodLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedById" TEXT NOT NULL,

    CONSTRAINT "AccountingPeriodLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingPeriodLock_tenantId_startDate_endDate_idx" ON "AccountingPeriodLock"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriodLock_tenantId_startDate_endDate_key" ON "AccountingPeriodLock"("tenantId", "startDate", "endDate");
