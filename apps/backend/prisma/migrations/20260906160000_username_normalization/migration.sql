-- Username-only auth, Part 2: stored usernames must match the canonical
-- comparison form used at login/create time (trim ends + collapse internal
-- whitespace runs to one space), so "احمد  الصياد" and "احمد الصياد" are one account.
-- Rows that differ only by whitespace (would collide after normalization)
-- are deduplicated: the oldest row keeps the clean name; newer duplicates are
-- deactivated and renamed with an id suffix (no silent data loss).

-- 1. Rename + deactivate newer duplicate rows (kept: oldest created_at, then id).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY btrim(regexp_replace("username", '\s+', ' ', 'g'))
           ORDER BY "created_at" ASC, id ASC
         ) AS rn
  FROM "User"
)
UPDATE "User" u
SET "username" = btrim(regexp_replace(u."username", '\s+', ' ', 'g')) || '#' || left(u.id, 6),
    "is_active" = false,
    "updated_at" = NOW()
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

-- 2. Normalize all remaining usernames to the canonical form.
UPDATE "User"
SET "username" = btrim(regexp_replace("username", '\s+', ' ', 'g')),
    "updated_at" = NOW()
WHERE "username" <> btrim(regexp_replace("username", '\s+', ' ', 'g'));
