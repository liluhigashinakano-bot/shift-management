import { prisma } from "@/lib/db";

export type ShiftHalf = "first" | "second";

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 期間の日付行をまとめて作る。
 * 既にある日付は飛ばす（同時に 2 人が開いても重複で落ちない）。
 */
async function createShiftDays(
  periodId: string,
  year: number,
  month: number,
  half: ShiftHalf,
) {
  const startDay = half === "first" ? 1 : 16;
  const endDay = half === "first" ? 15 : new Date(year, month, 0).getDate();

  const data = [];
  for (let d = startDay; d <= endDay; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    data.push({
      periodId,
      date,
      dayOfWeek: dayNames[date.getUTCDay()]!,
    });
  }

  if (data.length === 0) return;
  // 1 日 1 回の書き込みだと 1 店舗あたり 15〜16 往復になり、初回表示が目に見えて遅い
  await prisma.shiftDay.createMany({ data, skipDuplicates: true });
}

/**
 * 店舗×年月×半月のシフト期間が無ければ作成し、日付行も埋める。
 *
 * 2 人が同時にダッシュボードを開くと、以前は同じ期間を 2 回作ろうとして
 * 片方がエラー画面になっていた。upsert と skipDuplicates で、
 * 同時に走っても後から来たほうが既存を読むだけになる。
 */
export async function ensureShiftPeriod(
  storeId: string,
  year: number,
  month: number,
  half: ShiftHalf,
) {
  const period = await prisma.shiftPeriod.upsert({
    where: { storeId_year_month_half: { storeId, year, month, half } },
    update: {},
    create: { storeId, year, month, half },
  });

  const dayCount = await prisma.shiftDay.count({ where: { periodId: period.id } });
  if (dayCount === 0) {
    await createShiftDays(period.id, year, month, half);
  }
  return period;
}
