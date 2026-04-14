import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { MypageForm } from "@/components/mypage-form";

export default async function MypagePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { store: true },
  });

  if (!user) redirect("/login");

  // ユーザーが所属する店舗のシフト期間を取得
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 全店舗のシフト期間（キャストは他店ヘルプもあるため）
  const periods = await prisma.shiftPeriod.findMany({
    where: { year, month },
    include: {
      store: true,
      shiftDays: { orderBy: { date: "asc" }, select: { id: true, date: true, dayOfWeek: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { half: "asc" }],
  });

  // このキャストのシフト希望
  const myRequests = await prisma.shiftRequest.findMany({
    where: { castId: userId },
    include: {
      period: { include: { store: { select: { name: true } } } },
    },
    orderBy: [{ date: "asc" }],
  });

  return (
    <div className="min-h-screen">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1200px] mx-auto px-4 py-4">
        <h1 className="text-xl font-bold mb-2">
          マイページ - {user.name}
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          所属: {user.store?.name || "未所属"} / {user.email}
        </p>
        <MypageForm
          userId={userId}
          userName={user.name}
          storeName={user.store?.name || null}
          periods={JSON.parse(JSON.stringify(periods))}
          initialRequests={JSON.parse(JSON.stringify(myRequests))}
        />
      </main>
    </div>
  );
}
