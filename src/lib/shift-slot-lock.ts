import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** シフト表のスロット追加・削除・時間変更が許可されているか（シフト確定済みも不可） */
export async function isShiftSlotsUnlocked(periodId: string): Promise<boolean> {
  const p = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { shiftSlotsLocked: true, adjustmentConfirmedPublished: true },
  });
  if (!p) return false;
  if (p.shiftSlotsLocked) return false;
  if (p.adjustmentConfirmedPublished) return false;
  return true;
}

/** 締切またはシフト確定済みなら 403（シフト表の変更用） */
export async function assertShiftSlotsUnlocked(periodId: string) {
  const ok = await isShiftSlotsUnlocked(periodId);
  if (!ok) {
    return NextResponse.json(
      {
        error:
          "この期間のシフト表は締切中か、シフト確定済みのため変更できません（ロック解除はシフト表の「シフトロック中」ボタンから）",
      },
      { status: 403 },
    );
  }
  return null;
}

/** 管理者・従業員向け: シフト確定ロックのみチェック（希望/表の締切は対象外） */
export async function assertStaffShiftPeriodNotFinalized(periodId: string) {
  const p = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { adjustmentConfirmedPublished: true },
  });
  if (!p) {
    return NextResponse.json({ error: "期間が見つかりません" }, { status: 404 });
  }
  if (p.adjustmentConfirmedPublished) {
    return NextResponse.json(
      {
        error:
          "シフト確定ロック中のため変更できません（「シフトロック中」ボタンで解除してください）",
      },
      { status: 403 },
    );
  }
  return null;
}
