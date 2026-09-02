import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { CastManager } from "@/components/cast-manager";

export const dynamic = "force-dynamic";

export default async function CastsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role === "cast") redirect("/mypage");

  // ⚠️ passwordHash・hourlyRate をブラウザへ渡さない。
  //    キャストのパスワードは 6 桁の数字なので、ハッシュが渡ると総当たりで割り出せる。
  const casts = await prisma.user.findMany({
    where: { role: "cast", isTrialGuest: false },
    select: {
      id: true,
      name: true,
      email: true,
      castLoginId: true,
      storeId: true,
      store: { select: { id: true, name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
  });

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: session.user.role,
          storeName: session.user.storeName,
        }}
      />
      <main className="max-w-[1200px] mx-auto w-full min-w-0 px-3 sm:px-4 py-4">
        <h1 className="text-xl font-bold mb-4">在籍キャスト一覧</h1>
        <CastManager
          readOnly={role !== "admin"}
          initialCasts={casts}
          stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        />
      </main>
    </div>
  );
}
