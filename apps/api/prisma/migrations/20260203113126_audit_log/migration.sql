/*
  Warnings:

  - You are about to drop the column `entityType` on the `AuditLog` table. All the data in the column will be lost.
  - Added the required column `entity` to the `AuditLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AuditLog_tenantId_action_createdAt_idx";

-- DropIndex
DROP INDEX "AuditLog_tenantId_entityType_entityId_idx";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "entityType",
ADD COLUMN     "entity" TEXT NOT NULL,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorId_createdAt_idx" ON "AuditLog"("tenantId", "actorId", "createdAt");
