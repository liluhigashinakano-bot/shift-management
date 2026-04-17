import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** シフト希望の追加・編集・削除が許可されているか */
export async function isShiftRequestsUnlocked(periodId: string): Promise<boolean> {
  const p = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { shiftRequestsLocked: true },
  });
  return !(p?.shiftRequestsLocked ?? false);
}

/** 締切中なら 403 を返す（API 用） */
export async function assertShiftRequestsUnlocked(periodId: string) {
  const ok = await isShiftRequestsUnlocked(periodId);
  if (!ok) {
    return NextResponse.json(
      { error: "この期間のシフト希望は締め切りです" },
      { status: 403 },
    );
  }
  return null;
}
