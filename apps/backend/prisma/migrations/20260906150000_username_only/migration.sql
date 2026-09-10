-- Username-only auth: owner login becomes the plain name 'احمد الصياد'
-- (exact spelling per spec; full_name keeps 'أحمد الصياد').
-- Email field removed everywhere: no email in auth, users, or management UI.

-- 1. Rename the seeded owner row (deployments that already applied it).
UPDATE "User" SET "username" = 'احمد الصياد', "updated_at" = NOW()
WHERE "username" = 'owner@weladhalal.pos';

-- 2. Fresh databases that never had the old row: insert directly with the
--    new username. Random unusable hash + forced change; seed.ts activates
--    via OWNER_PASSWORD (production refuses without it).
INSERT INTO "User" ("id", "full_name", "username", "password_hash", "role", "permission_level", "is_owner", "force_password_change", "is_active", "created_at", "updated_at")
SELECT 'owner-ahmed-el-sayad', 'أحمد الصياد', 'احمد الصياد', '$2a$10$5IoHIhLQn7DpnyCrUO96p.qptmzwGVNrTo1clJPjCw/i6mhlT77NC', 'owner', 100, true, true, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "username" IN ('احمد الصياد', 'owner@weladhalal.pos'));

-- 3. Drop the email column (was nullable + unused; no email anywhere in auth flow).
ALTER TABLE "User" DROP COLUMN IF EXISTS "email";
