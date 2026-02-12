-- CreateTable
CREATE TABLE "AccountBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "creditTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountBalanceSnapshot_tenantId_asOfDate_idx" ON "AccountBalanceSnapshot"("tenantId", "asOfDate");

-- CreateIndex
CREATE INDEX "AccountBalanceSnapshot_tenantId_accountId_idx" ON "AccountBalanceSnapshot"("tenantId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBalanceSnapshot_tenantId_asOfDate_accountId_key" ON "AccountBalanceSnapshot"("tenantId", "asOfDate", "accountId");
