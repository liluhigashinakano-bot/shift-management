import { prisma } from "@/lib/db";

/**
 * キャストID の重複チェック。
 *
 * 2 点に注意している:
 *  - ログインは大文字小文字を区別しない（lower で照合）ので、確認も lower でそろえる。
 *    区別したままだと「Ai」と「ai」を両方作れて、片方はログインできなくなる。
 *  - 従業員のログインID（staffLoginId）とも突き合わせる。
 *    ログインは従業員 → キャストの順に探すため、同じ文字だとキャストが締め出される。
 */
export async function findExistingCastForCreate(
  email: string,
  castLoginId: string,
): Promise<{ id: string } | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE lower("email") = lower(${email})
       OR lower("castLoginId") = lower(${castLoginId})
       OR lower("staffLoginId") = lower(${castLoginId})
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
    WHERE (
        lower("email") = lower(${email})
        OR lower("castLoginId") = lower(${castLoginId})
        OR lower("staffLoginId") = lower(${castLoginId})
      )
      AND "id" != ${excludeUserId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * 従業員・閲覧者のログインID の重複チェック。
 * キャストID 側とも突き合わせる（上と対になる）。
 */
export async function findExistingStaffLogin(
  email: string,
  staffLoginId: string,
  excludeUserId?: string,
): Promise<{ id: string } | null> {
  const rows = excludeUserId
    ? await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "User"
        WHERE (
            lower("email") = lower(${email})
            OR lower("staffLoginId") = lower(${staffLoginId})
            OR lower("castLoginId") = lower(${staffLoginId})
          )
          AND "id" != ${excludeUserId}
        LIMIT 1
      `
    : await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "User"
        WHERE lower("email") = lower(${email})
           OR lower("staffLoginId") = lower(${staffLoginId})
           OR lower("castLoginId") = lower(${staffLoginId})
        LIMIT 1
      `;
  return rows[0] ?? null;
}
