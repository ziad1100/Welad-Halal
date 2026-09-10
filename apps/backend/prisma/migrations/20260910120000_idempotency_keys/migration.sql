-- Offline-first order idempotency (§5d). Additive table: no existing data touched.
-- Deduplicates retried POST /api/orders from the Electron outbox via Idempotency-Key.
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");
