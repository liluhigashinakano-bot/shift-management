import { prisma } from "@/lib/db";
import { normalizeLoginCredential } from "@/lib/login-email";

/**
 * ログイン入力（メール全文 or キャストIDのみ）から User.id を解決する。
 * Prisma の findUnique/findFirst + OR は SQLite アダプターで Invalid になるため、SQL で id のみ取得してから findUnique({ id }) する。
 * SQLite の文字列比較は大文字小文字を区別するため、メール・キャストIDは lower() で照合する。
 */
export async function findUserIdForLogin(rawLogin: string): Promise<string | null> {
  const normalized = normalizeLoginCredential(rawLogin);
  if (!normalized) return null;

  if (normalized.includes("@")) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE lower("email") = lower(${normalized}) LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  const staffRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "staffLoginId" IS NOT NULL
      AND "role" IN ('admin', 'employee', 'viewer')
      AND lower("staffLoginId") = lower(${normalized})
    LIMIT 1
  `;
  if (staffRows[0]?.id) return staffRows[0].id;

  const emailGuess = `${normalized}@cast.local`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "role" = 'cast' AND (
      ("castLoginId" IS NOT NULL AND lower("castLoginId") = lower(${normalized}))
      OR lower("email") = lower(${emailGuess})
    )
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}
