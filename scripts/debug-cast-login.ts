import { prisma } from "@/lib/db";
import { findUserIdForLogin } from "@/lib/auth-lookup-user";
import { compareSync } from "bcryptjs";

async function main() {
  const login = process.argv[2] ?? "test003";
  const testPassword = process.argv[3]; // optional

  const id = await findUserIdForLogin(login);
  console.log("findUserIdForLogin(%s) => %s", login, id);

  const rows = await prisma.$queryRaw<
    { id: string; email: string; castLoginId: string | null; role: string }[]
  >`
    SELECT "id", "email", "castLoginId", "role" FROM "User"
    WHERE "castLoginId" LIKE ${"%" + login + "%"} OR "email" LIKE ${"%" + login + "%"}
  `;
  console.log("matching rows:", rows);

  if (id) {
    const user = await prisma.user.findUnique({ where: { id } });
    console.log("findUnique:", user?.email, user?.castLoginId, user?.role);
    if (user && testPassword) {
      console.log("compareSync:", compareSync(testPassword, user.passwordHash));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
