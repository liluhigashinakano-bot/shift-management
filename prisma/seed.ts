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
  const storeNames = [
    "東中野", "新中野", "方南町", "板橋本町", "目白", "中村橋", "久我山",
  ];

  const stores: Record<string, { id: string }> = {};
  for (const name of storeNames) {
    stores[name] = await prisma.store.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await prisma.user.upsert({
    where: { email: "admin@shift.local" },
    update: {},
    create: {
      name: "管理者",
      email: "admin@shift.local",
      passwordHash: hashSync("admin123", 10),
      role: "admin",
    },
  });

  const employees = [
    { name: "吉田", store: "東中野" },
    { name: "ナビ", store: "東中野" },
    { name: "西山", store: "新中野" },
  ];
  for (const emp of employees) {
    const email = `${emp.name}@shift.local`;
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: emp.name, email,
        passwordHash: hashSync("staff123", 10),
        role: "employee",
        storeId: stores[emp.store].id,
      },
    });
  }

  const casts = [
    { name: "りりむ", store: "東中野", rate: 2000 },
    { name: "かのん", store: "東中野", rate: 1800 },
    { name: "ゆの", store: "東中野", rate: 1800 },
    { name: "まい", store: "東中野", rate: 1700 },
    { name: "みな", store: "東中野", rate: 1700 },
    { name: "すずな", store: "東中野", rate: 1800 },
    { name: "ひな", store: "東中野", rate: 1700 },
    { name: "いけ", store: "新中野", rate: 1800 },
    { name: "りく", store: "東中野", rate: 1700 },
    { name: "はるひ", store: "東中野", rate: 1700 },
  ];
  for (const cast of casts) {
    const email = `${cast.name}@cast.local`;
    await prisma.user.upsert({
      where: { email },
      update: { castLoginId: cast.name },
      create: {
        name: cast.name,
        email,
        castLoginId: cast.name,
        passwordHash: hashSync("cast123", 10),
        role: "cast",
        storeId: stores[cast.store].id,
        hourlyRate: cast.rate,
      },
    });
  }

  console.log("Seed完了: 7店舗 + 管理者 + 社員3名 + キャスト10名");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
