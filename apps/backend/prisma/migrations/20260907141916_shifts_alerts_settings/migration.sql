/*
  Warnings:

  - You are about to alter the column `closingCashAmount` on the `Shift` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `expectedCashAmount` on the `Shift` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `discrepancyAmount` on the `Shift` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.

*/
-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "closingCashAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "expectedCashAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discrepancyAmount" SET DATA TYPE DECIMAL(12,2);
