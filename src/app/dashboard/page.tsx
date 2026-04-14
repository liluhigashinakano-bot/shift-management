import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" } });

  // 現在の年月と前半/後半を計算
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const half = now.getDate() <= 15 ? "first" : "second";

  // 各店舗のシフト期間を取得
  const periods = await prisma.shiftPeriod.findMany({
    where: { year, month },
    include: { store: true, _count: { select: { shiftDays: true } } },
  });

  const periodMap = new Map(
    periods.map((p) => [`${p.storeId}-${p.half}`, p])
  );

  return (
    <div className="min-h-screen">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">
          {year}年{month}月 シフト管理
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {stores.map((store) => {
            const firstPeriod = periodMap.get(`${store.id}-first`);
            const secondPeriod = periodMap.get(`${store.id}-second`);

            return (
              <Card key={store.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {store.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(["first", "second"] as const).map((h) => {
                    const period = h === "first" ? firstPeriod : secondPeriod;
                    const label = h === "first" ? "前半" : "後半";
                    const isCurrent = h === half;

                    return (
                      <div key={h} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {month}月{label}
                          </span>
                          {isCurrent && (
                            <Badge
                              variant="secondary"
                              className="bg-pink-100 text-pink-700 text-xs"
                            >
                              現在
                            </Badge>
                          )}
                        </div>
                        {period ? (
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/requests/${store.id}/${period.id}`}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              希望
                            </Link>
                            <Link
                              href={`/adjustments/${store.id}/${period.id}`}
                              className="text-xs text-orange-600 hover:text-orange-800"
                            >
                              調整
                            </Link>
                            <Link
                              href={`/shifts/${store.id}/${period.id}`}
                              className="text-sm text-pink-600 hover:text-pink-800 font-medium"
                            >
                              シフト表
                            </Link>
                          </div>
                        ) : (
                          <CreatePeriodButton
                            storeId={store.id}
                            year={year}
                            month={month}
                            half={h}
                          />
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function CreatePeriodButton({
  storeId,
  year,
  month,
  half,
}: {
  storeId: string;
  year: number;
  month: number;
  half: string;
}) {
  async function createPeriod() {
    "use server";
    const { prisma: db } = await import("@/lib/db");

    const period = await db.shiftPeriod.create({
      data: { storeId, year, month, half },
    });

    // 日付を生成
    const startDay = half === "first" ? 1 : 16;
    const endDay =
      half === "first"
        ? 15
        : new Date(year, month, 0).getDate();

    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

    for (let d = startDay; d <= endDay; d++) {
      const date = new Date(year, month - 1, d);
      await db.shiftDay.create({
        data: {
          periodId: period.id,
          date,
          dayOfWeek: dayNames[date.getDay()],
        },
      });
    }

    const { redirect: redir } = await import("next/navigation");
    redir(`/shifts/${storeId}/${period.id}`);
  }

  return (
    <form action={createPeriod}>
      <button
        type="submit"
        className="text-sm text-gray-400 hover:text-pink-600 font-medium"
      >
        + 作成
      </button>
    </form>
  );
}
