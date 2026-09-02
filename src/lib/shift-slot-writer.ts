import type { Prisma } from "@/generated/prisma/client";

export type NewSlot = {
  dayId: string;
  timeSlot: number;
  castId: string;
  isStart: boolean;
  isEnd: boolean;
  memo: string | null;
};

/** [start, end) を 30 分刻みのスロットに割る */
export function slotsForRange(
  dayId: string,
  castId: string,
  start: number,
  end: number,
  memo: string | null,
): NewSlot[] {
  const out: NewSlot[] = [];
  for (let t = start; t < end; t += 0.5) {
    out.push({
      dayId,
      timeSlot: t,
      castId,
      isStart: t === start,
      isEnd: t + 0.5 >= end,
      memo: t === start ? memo : null,
    });
  }
  return out;
}

/**
 * その日・そのキャストのスロットを見直して、出勤・退勤の印を付け直す。
 * 一部だけ消したり足したりしたあとに呼ぶ（帯が分かれていても先頭と末尾に印が付く）。
 */
export async function repairSlotBoundaries(
  tx: Prisma.TransactionClient,
  dayId: string,
  castId: string,
): Promise<void> {
  const slots = await tx.shiftSlot.findMany({
    where: { dayId, castId },
    orderBy: { timeSlot: "asc" },
    select: { id: true, timeSlot: true },
  });
  if (slots.length === 0) return;
  const first = slots[0]!.timeSlot;
  const last = slots[slots.length - 1]!.timeSlot;
  const shiftEnd = last + 0.5;
  for (const s of slots) {
    await tx.shiftSlot.update({
      where: { id: s.id },
      data: {
        isStart: s.timeSlot === first,
        isEnd: s.timeSlot + 0.5 >= shiftEnd,
      },
    });
  }
}
