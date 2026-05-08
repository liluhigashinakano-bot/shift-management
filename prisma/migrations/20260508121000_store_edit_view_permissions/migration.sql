-- Add per-store edit permission. Existing assignments keep the previous behavior:
-- employees/admins can edit assigned stores, viewers can only view them.
ALTER TABLE "User" ADD COLUMN "editAllStores" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserStoreAssignment" ADD COLUMN "canEdit" BOOLEAN NOT NULL DEFAULT true;

UPDATE "User"
SET "editAllStores" = true
WHERE "role" = 'admin'
   OR ("role" = 'employee' AND "accessAllStores" = true);

UPDATE "UserStoreAssignment" usa
SET "canEdit" = false
FROM "User" u
WHERE usa."userId" = u."id"
  AND u."role" = 'viewer';
