import { prisma } from "@/lib/db";
import {
  nextPeriod,
  periodFromNow,
  periodIndex,
  type ShiftHalf,
  type ShiftPeriodKey,
} from "@/lib/period-utils";

export type SelectablePeriod = ShiftPeriodKey & { id: string };

/**
 * キャストが切り替えられる期間（過去すべて〜次の期間まで）。
 * 「次の期間」は日本時間で判定する（機械の時計が世界標準時でもずれない）。
 */
export async function listCastSelectablePeriods(
  storeId: string,
): Promise<SelectablePeriod[]> {
  const maxIdx = periodIndex(nextPeriod(periodFromNow()));
  const all = await prisma.shiftPeriod.findMany({
    where: { storeId },
    select: { id: true, year: true, month: true, half: true },
    orderBy: [{ year: "asc" }, { month: "asc" }, { half: "asc" }],
  });
  return all
    .map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      half: p.half as ShiftHalf,
    }))
    .filter((p) => periodIndex(p) <= maxIdx);
}
