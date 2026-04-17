import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** シフト表のスロット追加・削除・時間変更が許可されているか */
export async function isShiftSlotsUnlocked(periodId: string): Promise<boolean> {
  const p = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { shiftSlotsLocked: true },
  });
  return !(p?.shiftSlotsLocked ?? false);
}

/** 締切中なら 403（シフト表の変更用） */
export async function assertShiftSlotsUnlocked(periodId: string) {
  const ok = await isShiftSlotsUnlocked(periodId);
  if (!ok) {
    return NextResponse.json(
      { error: "この期間のシフト表は追加・変更が締め切られています" },
      { status: 403 },
    );
  }
  return null;
}
