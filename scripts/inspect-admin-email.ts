import { prisma } from "../src/lib/db";

async function main() {
  const u = await prisma.user.findFirst({
    where: { email: { contains: "admin" } },
    select: { id: true, email: true, role: true },
  });
  console.log(u);
  if (u?.email) {
    console.log(
      u.email
        .split("")
        .map((ch) => `${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
        .join(" | ")
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
