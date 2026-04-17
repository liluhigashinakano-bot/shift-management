import { prisma } from "../src/lib/db.js";
import { findUserIdForLogin } from "../src/lib/auth-lookup-user.js";
import { compareSync } from "bcryptjs";

async function main() {
  const id = await findUserIdForLogin("admin@shift.local");
  console.log("findUserIdForLogin", id);
  const u = id
    ? await prisma.user.findUnique({
        where: { id },
        include: { store: true },
      })
    : null;
  console.log(
    "findUnique",
    u ? { id: u.id, email: u.email, hasHash: !!u.passwordHash } : null,
  );
  if (u) console.log("password ok", compareSync("admin123", u.passwordHash));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
