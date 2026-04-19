import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessStore } from "@/lib/store-access";

/** 調整一覧の「確定」列の表示を切り替え（管理者・社員のみ） */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ periodId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role?: string; storeId?: string | null };
  const role = user.role;
  if (role !== "admin" && role !== "employee") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { periodId } = await context.params;
  let body: { published?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const published = Boolean(body?.published);

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, storeId: true },
  });
  if (!period) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (role === "employee" && !canAccessStore(user as any, period.storeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.shiftPeriod.update({
    where: { id: periodId },
    data: { adjustmentConfirmedPublished: published },
  });

  return NextResponse.json({ ok: true, adjustmentConfirmedPublished: published });
}
