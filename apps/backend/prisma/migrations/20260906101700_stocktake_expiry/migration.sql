-- CreateEnum
CREATE TYPE "StockTakeStatus" AS ENUM ('OPEN', 'COMMITTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'STOCKTAKE';

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNo" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTake" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StockTakeStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "StockTake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTakeLine" (
    "id" TEXT NOT NULL,
    "takeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "systemQty" DECIMAL(12,3) NOT NULL,
    "countedQty" DECIMAL(12,3),

    CONSTRAINT "StockTakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryBatch_productId_idx" ON "InventoryBatch"("productId");

-- CreateIndex
CREATE INDEX "InventoryBatch_expiryDate_idx" ON "InventoryBatch"("expiryDate");

-- CreateIndex
CREATE INDEX "StockTake_status_createdAt_idx" ON "StockTake"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StockTakeLine_productId_idx" ON "StockTakeLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTakeLine_takeId_productId_key" ON "StockTakeLine"("takeId", "productId");

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTake" ADD CONSTRAINT "StockTake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "StockTake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTakeLine" ADD CONSTRAINT "StockTakeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
