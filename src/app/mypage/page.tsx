import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { ensureShiftPeriod } from "@/lib/ensure-shift-period";
import { periodFromNow } from "@/lib/period-utils";

export const dynamic = "force-dynamic";

/**
 * キャストの入口。希望一覧（/requests）へ送るだけの画面。
 *
 * 管理者・従業員がここを開くと、以前は自分をキャストとして希望を出す画面が出ていた。
 * リンクは無いが住所を直接打てば開けたので、ダッシュボードへ送る。
 */
export default async function MypagePage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "cast") {
    redirect("/dashboard");
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, storeId: true },
  });

  if (!user) redirect("/login");

  if (user.storeId) {
    const current = periodFromNow();
    // 管理者がダッシュボードを開くまで期間が作られず、
    // キャストが希望を出せない時間帯があった。ここでも作る。
    const period = await ensureShiftPeriod(
      user.storeId,
      current.year,
      current.month,
      current.half,
    );
    redirect(`/requests/${user.storeId}/${period.id}`);
  }

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: session.user.role,
          storeName: session.user.storeName,
        }}
      />
      <main className="max-w-[600px] mx-auto w-full min-w-0 px-3 sm:px-4 py-8">
        <h1 className="text-xl font-bold mb-2">マイページ</h1>
        <p className="text-sm text-gray-600">
          所属店舗がまだ設定されていません。店舗の担当者にお知らせください。
        </p>
      </main>
    </div>
  );
}
