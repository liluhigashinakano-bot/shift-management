import { compareSync } from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUnique({
    where: { email: "admin@shift.local" },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  if (!u) {
    console.log("admin user not found");
    return;
  }

  const ok = compareSync("admin123", u.passwordHash);
  console.log({ email: u.email, role: u.role, ok });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
