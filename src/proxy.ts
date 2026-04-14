import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function proxy(request: Request) {
  const { pathname } = new URL(request.url);

  // 公開ページ
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const session = await auth();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
