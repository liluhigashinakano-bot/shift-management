import crypto from "crypto";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * INSERT は生 SQL、取得は id の findUnique のみ行う。
 * createdAt は PostgreSQL では CURRENT_TIMESTAMP（SQLite の datetime('now') は使わない）。
 */
export async function createCastUserRecord(input: {
  name: string;
  email: string;
  castLoginId: string;
  password: string;
  storeId: string;
}): Promise<{
  id: string;
  name: string;
  email: string;
  castLoginId: string | null;
  storeId: string | null;
}> {
  const id = crypto.randomUUID();
  const passwordHash = hashSync(input.password.trim(), 10);

  await prisma.$executeRaw`
    INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "castLoginId", "storeId", "createdAt")
    VALUES (
      ${id},
      ${input.name},
      ${input.email},
      ${passwordHash},
      'cast',
      ${input.castLoginId},
      ${input.storeId},
      CURRENT_TIMESTAMP
    )
  `;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      email: string;
      castLoginId: string | null;
      storeId: string | null;
    }[]
  >`
    SELECT "id", "name", "email", "castLoginId", "storeId" FROM "User" WHERE "id" = ${id} LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("キャスト登録後の読み込みに失敗しました");
  }
  return row;
}
