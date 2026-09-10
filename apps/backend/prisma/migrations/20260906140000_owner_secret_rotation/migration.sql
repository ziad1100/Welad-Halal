-- Remove the bootstrap credential from the database: the owner row keeps
-- force_password_change, but its hash becomes a random value nobody knows.
-- Activation happens only via seed with OWNER_PASSWORD (production refuses
-- to seed without it). See seed.ts + DEPLOY.md.
UPDATE "User"
SET "password_hash" = '$2a$10$5IoHIhLQn7DpnyCrUO96p.qptmzwGVNrTo1clJPjCw/i6mhlT77NC',
    "force_password_change" = true,
    "updated_at" = NOW()
WHERE "username" = 'owner@weladhalal.pos';
