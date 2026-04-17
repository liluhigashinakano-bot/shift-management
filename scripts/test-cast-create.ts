import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashSync } from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL を設定してください");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const store = await prisma.store.findFirst({ where: { name: "方南町" } });
  if (!store) {
    console.error("store 方南町 not found");
    process.exit(1);
  }
  const email = "test001@cast.local";
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { castLoginId: "test001" }] },
  });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } });
  }
  const u = await prisma.user.create({
    data: {
      name: "テスト",
      email,
      castLoginId: "test001",
      passwordHash: hashSync("Kw91fXBqJKFN*Gy49LMz", 10),
      role: "cast",
      storeId: store.id,
    },
  });
  console.log("OK created", u.id);
}

main()
  .catch((e) => {
    console.error("FAIL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
