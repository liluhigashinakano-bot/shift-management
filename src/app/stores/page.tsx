import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { StoreManager } from "@/components/store-manager";

export default async function StoresPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string }).role;
  if (role === "cast") redirect("/dashboard");

  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: { where: { role: "cast", isTrialGuest: false } } } } },
  });

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[800px] mx-auto w-full min-w-0 px-3 sm:px-4 py-4">
        <h1 className="text-xl font-bold mb-4">店舗管理</h1>
        <StoreManager
          readOnly={role === "viewer"}
          initialStores={stores.map((s) => ({
            id: s.id,
            name: s.name,
            castCount: s._count.users,
          }))}
        />
      </main>
    </div>
  );
}
