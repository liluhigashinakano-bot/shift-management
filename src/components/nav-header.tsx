"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublicOrigin } from "@/lib/public-origin";
import { signOut } from "next-auth/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
  { href: "/stores", label: "店舗管理", staffNotCast: true },
  { href: "/permissions", label: "権限設定", adminOnly: true },
];

function filterNavItems(user: Props["user"]) {
  return navItems.filter((item) => {
    if (item.adminOnly && user.role !== "admin") return false;
    if ((item as { staffNotCast?: boolean }).staffNotCast && user.role === "cast")
      return false;
    if ((item as { staffOnly?: boolean }).staffOnly && user.role === "cast")
      return false;
    if ((item as { castOnly?: boolean }).castOnly && user.role !== "cast")
      return false;
    return true;
  });
}

export function NavHeader({ user }: Props) {
  const pathname = usePathname();
  const homeHref = user.role === "cast" ? "/" : "/dashboard";
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = filterNavItems(user);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (media.matches) setMobileOpen(false);
    };

    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  const linkClass = (href: string) =>
    cn(
      "px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors touch-manipulation min-h-10 inline-flex items-center whitespace-nowrap shrink-0",
      pathname.startsWith(href)
        ? "bg-white/60 text-purple-700"
        : "text-purple-500/70 hover:bg-white/40 hover:text-purple-700",
    );

  const roleLabel =
    user.role === "admin"
      ? "管理者"
      : user.role === "employee"
        ? "従業員"
        : user.role === "viewer"
          ? "閲覧者"
          : "キャスト";

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-pink-100 via-purple-50 to-sky-100 border-b border-pink-200/50 shadow-sm pt-[env(safe-area-inset-top)]">
      <div className="max-w-[1800px] mx-auto px-3 sm:px-4 flex flex-nowrap items-center min-h-14 gap-2 sm:gap-6 min-w-0 overflow-x-auto [scrollbar-width:thin]">
        <Link
          href={homeHref}
          className="font-bold text-sm sm:text-lg bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 bg-clip-text text-transparent shrink-0 min-w-0 whitespace-nowrap"
        >
          シフト管理
        </Link>

        <nav className="hidden md:flex flex-1 gap-1 min-w-0 overflow-x-auto flex-nowrap">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex ml-auto items-center gap-2 sm:gap-3 text-xs sm:text-sm shrink-0 flex-nowrap">
          <span className="text-gray-500 whitespace-nowrap">
            {user.storeName && `${user.storeName} / `}
            {user.name}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs bg-purple-100 text-purple-700 whitespace-nowrap shrink-0">
            {roleLabel}
          </span>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-[10px] sm:text-xs touch-manipulation min-h-9 px-2 whitespace-nowrap shrink-0"
            onClick={async () => {
              await signOut({ redirect: false });
              window.location.assign(`${getPublicOrigin()}/login`);
            }}
          >
            ログアウト
          </button>
        </div>

        <div className="flex md:hidden ml-auto items-center gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-pink-200/80 bg-white/80 text-purple-700 shadow-sm touch-manipulation"
              aria-label="メニューを開く"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            {mobileOpen && (
              <SheetContent side="right" className="w-[min(100vw-1rem,20rem)]">
              <SheetHeader>
                <SheetTitle>メニュー</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-2">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(linkClass(item.href), "w-full justify-start")}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 border-t border-border pt-4 px-2 space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {user.storeName && (
                    <span className="block text-xs text-gray-500">
                      {user.storeName}
                    </span>
                  )}
                  <span className="font-medium text-foreground">{user.name}</span>
                </p>
                <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                  {roleLabel}
                </span>
                <div>
                  <button
                    type="button"
                    className="text-sm text-gray-500 hover:text-gray-800 touch-manipulation min-h-10"
                    onClick={async () => {
                      setMobileOpen(false);
                      await signOut({ redirect: false });
                      window.location.assign(`${getPublicOrigin()}/login`);
                    }}
                  >
                    ログアウト
                  </button>
                </div>
              </div>
              </SheetContent>
            )}
          </Sheet>
        </div>
      </div>
    </header>
  );
}
