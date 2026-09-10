-- §4 — payment method on orders so shift reconciliation counts CASH
-- movements only (card/online orders never touch the drawer).
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'CASH';
