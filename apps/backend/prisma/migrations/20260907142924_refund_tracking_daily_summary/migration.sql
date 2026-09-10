/*
  Warnings:

  - You are about to drop the column `returnedAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `returnedById` on the `Order` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "AlertKind" ADD VALUE 'DAILY_SUMMARY';

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_returnedById_fkey";

-- DropIndex
DROP INDEX "Order_returnedAt_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "returnedAt",
DROP COLUMN "returnedById",
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedById" TEXT;

-- CreateIndex
CREATE INDEX "Order_refundedAt_idx" ON "Order"("refundedAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
