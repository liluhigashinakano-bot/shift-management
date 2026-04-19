import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** シフト希望の追加・編集・削除が許可されているか（シフト確定済みも不可） */
export async function isShiftRequestsUnlocked(periodId: string): Promise<boolean> {
  const p = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { shiftRequestsLocked: true, adjustmentConfirmedPublished: true },
  });
  if (!p) return false;
  if (p.shiftRequestsLocked) return false;
  if (p.adjustmentConfirmedPublished) return false;
  return true;
}

/** 締切またはシフト確定済みなら 403（API 用） */
export async function assertShiftRequestsUnlocked(periodId: string) {
  const ok = await isShiftRequestsUnlocked(periodId);
  if (!ok) {
    return NextResponse.json(
      {
        error:
          "この期間のシフト希望は締切中か、シフト確定済みのため変更できません（確定の取り消しはシフト表の「シフトを編集する」から）",
      },
      { status: 403 },
    );
  }
  return null;
}
