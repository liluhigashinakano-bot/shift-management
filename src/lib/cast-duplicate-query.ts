import { prisma } from "@/lib/db";

/**
 * better-sqlite3 アダプターで findUnique/OR が Invalid になる回避策として、
 * 重複チェックのみ生 SQL（パラメータバインド）で行う。
 */
export async function findExistingCastForCreate(
  email: string,
  castLoginId: string,
): Promise<{ id: string } | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "email" = ${email} OR "castLoginId" = ${castLoginId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findExistingCastForUpdate(
  email: string,
  castLoginId: string,
  excludeUserId: string,
): Promise<{ id: string } | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE ("email" = ${email} OR "castLoginId" = ${castLoginId})
      AND "id" != ${excludeUserId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
