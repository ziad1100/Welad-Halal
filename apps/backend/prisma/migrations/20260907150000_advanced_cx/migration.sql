-- §1/§2/§5/§7 advanced batch: public receipt tokens + ratings, discount codes,
-- return-approval tracking, and trigram fuzzy-search support.

-- §5 — trigram similarity for typo-tolerant product name search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable: Order gains §1 public token (QR → public page), rating, §2 discount
-- code snapshot, §7 return-approval request stamp. All nullable / backfilled so
-- existing rows keep working with zero data migration.
ALTER TABLE "Order" ADD COLUMN     "public_token" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "rating_note" TEXT,
ADD COLUMN     "discount_code" TEXT,
ADD COLUMN     "return_requested_by_id" TEXT,
ADD COLUMN     "return_requested_at" TIMESTAMP(3);

-- Backfill a non-sequential random token for historical orders so their receipts
-- can be re-printed with a working QR link (UUID hex without dashes, 32 chars).
UPDATE "Order"
SET "public_token" = replace(gen_random_uuid()::text, '-', '')
WHERE "public_token" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_public_token_key" ON "Order"("public_token");

-- CreateIndex
CREATE INDEX "Order_return_requested_at_idx" ON "Order"("return_requested_at");

-- §5 — trigram GIN index over the name columns used by fuzzy matching.
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING gin (("name" || ' ' || COALESCE("nameAr", '')) gin_trgm_ops);

-- CreateTable: §2 discount codes
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL DEFAULT 'percentage',
    "discountValue" DECIMAL(12,2) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE INDEX "DiscountCode_code_idx" ON "DiscountCode"("code");
