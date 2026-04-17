"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

type Props = {
  user: {
    name: string;
    role: string;
    storeName?: string | null;
  };
};

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", staffOnly: true },
  { href: "/casts", label: "キャスト管理", staffOnly: true },
  { href: "/stores", label: "店舗管理", adminOnly: true },
];

export function NavHeader({ user }: Props) {
  const pathname = usePathname();
  const homeHref = user.role === "cast" ? "/" : "/dashboard";

  return (
    <header className="bg-gradient-to-r from-pink-100 via-purple-50 to-sky-100 border-b border-pink-200/50 shadow-sm">
      <div className="max-w-[1800px] mx-auto px-4 flex items-center h-14 gap-6">
        <Link href={homeHref} className="font-bold text-lg bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 bg-clip-text text-transparent">
          シフト管理
        </Link>
        <nav className="flex gap-1">
          {navItems
            .filter((item) => {
              if (item.adminOnly && user.role !== "admin") return false;
              if ((item as any).staffOnly && (user.role === "cast")) return false;
              if ((item as any).castOnly && user.role !== "cast") return false;
              return true;
            })
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  pathname.startsWith(item.href)
                    ? "bg-white/60 text-purple-700"
                    : "text-purple-500/70 hover:bg-white/40 hover:text-purple-700"
                )}
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-gray-500">
            {user.storeName && `${user.storeName} / `}
            {user.name}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
            {user.role === "admin"
              ? "管理者"
              : user.role === "employee"
                ? "社員"
                : "キャスト"}
          </span>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-xs"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
