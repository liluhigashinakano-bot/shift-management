import { prisma } from "@/lib/db";

export type ShiftHalf = "first" | "second";

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

async function createShiftDays(
  periodId: string,
  year: number,
  month: number,
  half: ShiftHalf,
) {
  const startDay = half === "first" ? 1 : 16;
  const endDay =
    half === "first" ? 15 : new Date(year, month, 0).getDate();

  for (let d = startDay; d <= endDay; d++) {
    const date = new Date(year, month - 1, d);
    await prisma.shiftDay.create({
      data: {
        periodId,
        date,
        dayOfWeek: dayNames[date.getDay()],
      },
    });
  }
}

/**
 * 店舗×年月×半月のシフト期間が無ければ作成し、日付行も埋める。
 * ダッシュボード表示時に呼び、「＋作成」操作を不要にする。
 */
export async function ensureShiftPeriod(
  storeId: string,
  year: number,
  month: number,
  half: ShiftHalf,
) {
  const existing = await prisma.shiftPeriod.findUnique({
    where: {
      storeId_year_month_half: { storeId, year, month, half },
    },
    include: { _count: { select: { shiftDays: true } } },
  });

  if (existing) {
    if (existing._count.shiftDays === 0) {
      await createShiftDays(existing.id, year, month, half);
    }
    return existing;
  }

  const period = await prisma.shiftPeriod.create({
    data: { storeId, year, month, half },
  });
  await createShiftDays(period.id, year, month, half);
  return period;
}
