-- Welad Halal accounts & RBAC: level-based roles (owner 100 / manager 50 / employee 10)
-- Existing rows map: ADMIN -> manager, MANAGER -> manager, CASHIER -> employee.

-- 1. Replace Role enum values
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
CREATE TYPE "Role_new" AS ENUM ('owner', 'manager', 'employee');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'manager'::"Role_new"
    WHEN 'MANAGER' THEN 'manager'::"Role_new"
    ELSE 'employee'::"Role_new"
  END
);
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'employee';

-- 2. Rename columns to spec names (data preserved)
ALTER TABLE "User" RENAME COLUMN "name" TO "full_name";
ALTER TABLE "User" RENAME COLUMN "passwordHash" TO "password_hash";
ALTER TABLE "User" RENAME COLUMN "active" TO "is_active";
ALTER TABLE "User" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "User" RENAME COLUMN "updatedAt" TO "updated_at";

-- 3. New RBAC columns
ALTER TABLE "User" ADD COLUMN "permission_level" INTEGER NOT NULL DEFAULT 10;
UPDATE "User" SET "permission_level" = 50 WHERE "role" = 'manager';
ALTER TABLE "User" ADD COLUMN "is_owner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "created_by_user_id" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "User" ADD COLUMN "force_password_change" BOOLEAN NOT NULL DEFAULT false;

-- 4. Exactly one owner row, ever (database level)
CREATE UNIQUE INDEX "User_is_owner_unique" ON "User"("is_owner") WHERE "is_owner" = true;

-- 5. Owner seed: Ahmed El-Sayad (bootstrap secret hash; must-change on first login).
--    Plaintext bootstrap secret is documented in DEPLOY.md rotation notes, never used after rotation.
INSERT INTO "User" ("id", "full_name", "username", "password_hash", "role", "permission_level", "is_owner", "force_password_change", "is_active", "created_at", "updated_at")
VALUES ('owner-ahmed-el-sayad', 'أحمد الصياد', 'owner@weladhalal.pos', '$2a$10$8If8twMgd3u.tdSVhor6ve8cheIARwIF4atGWXVSvE5urpLHV.sBq', 'owner', 100, true, true, true, NOW(), NOW())
ON CONFLICT ("username") DO NOTHING;
