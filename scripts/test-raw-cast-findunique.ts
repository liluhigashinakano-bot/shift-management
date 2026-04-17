import crypto from "crypto";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";

async function main() {
  const id = crypto.randomUUID();
  const email = "testcastxyz@cast.local";
  const cid = "testcastxyz";
  const storeRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Store" LIMIT 1
  `;
  const storeId = storeRows[0]?.id;
  if (!storeId) throw new Error("no store");

  await prisma.$executeRaw`
    INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "castLoginId", "storeId", "createdAt")
    VALUES (
      ${id},
      'Test',
      ${email},
      ${hashSync("secret123", 10)},
      'cast',
      ${cid},
      ${storeId},
      CURRENT_TIMESTAMP
    )
  `;

  try {
    const u = await prisma.user.findUnique({ where: { id } });
    console.log("findUnique ok", u?.email, u?.castLoginId);
  } catch (e) {
    console.error("findUnique FAIL", e);
  }

  await prisma.user.delete({ where: { id } });
  await prisma.$disconnect();
}

main().catch(console.error);
