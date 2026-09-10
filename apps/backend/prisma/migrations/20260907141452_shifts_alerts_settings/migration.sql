-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('CASH_DISCREPANCY', 'PENDING_RETURN_APPROVAL', 'LOW_STOCK');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed');

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_created_by_user_id_fkey";

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "returnedById" TEXT;

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT,
    "openingCashAmount" DECIMAL(12,2) NOT NULL,
    "closingCashAmount" DECIMAL(65,30),
    "expectedCashAmount" DECIMAL(65,30),
    "discrepancyAmount" DECIMAL(65,30),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',
    "closedById" TEXT,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shift_employeeId_startedAt_idx" ON "Shift"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "Shift_status_startedAt_idx" ON "Shift"("status", "startedAt");

-- CreateIndex
CREATE INDEX "Alert_kind_createdAt_idx" ON "Alert"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_isRead_createdAt_idx" ON "Alert"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Order_returnedAt_idx" ON "Order"("returnedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "User_role_active_idx" RENAME TO "User_role_is_active_idx";
