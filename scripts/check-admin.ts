import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findUnique({
    where: { email: "admin@shift.local" },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  console.log(u);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

