import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { PermissionSettingsContent } from "@/components/permission-settings-content";

export default async function PermissionsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if ((session.user as { role?: string }).role !== "admin") {
    redirect("/dashboard");
  }

  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as { role: string }).role,
          storeName: (session.user as { storeName?: string | null }).storeName,
        }}
      />
      <main className="max-w-[960px] mx-auto w-full min-w-0 px-3 sm:px-4 py-4">
        <h1 className="text-xl font-bold mb-2">権限設定</h1>
        <p className="text-sm text-muted-foreground mb-6">
          管理者・従業員・閲覧者のアカウントの一覧・編集と、新規作成ができます。閲覧者はこのページにアクセスできません。
        </p>
        <PermissionSettingsContent stores={stores} />
      </main>
    </div>
  );
}
