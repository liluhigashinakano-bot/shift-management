import { prisma } from "./db";
import { readSheet, writeSheet, writeCell, isSheetsConfigured } from "./google-sheets";
import { TIME_SLOTS, formatTimeSlot } from "./shift-utils";

// Google Sheetsのシート構造（Excel準拠）
// Row 2: 日付番号（B2, H2, N2, T2, Z2, AF2, AL2, AR2）
// Row 4: 曜日
// Row 6: ヘッダー（時間, 出勤, 退勤, 人数, メモ）
// Rows 7-25: 19:00〜28:00 のスロット（19行）
// Row 26: 日別予算/総時間/社員
// Row 27: 企画名
// Row 28: 来店予定
// Row 29: 備考
// Row 32〜: 後半の日付（同構造）

// 各日の開始列（0-indexed）: 1, 7, 13, 19, 25, 31, 37, 43（8日分）
const DAY_COL_OFFSETS = [1, 7, 13, 19, 25, 31, 37, 43];
const DATA_ROW_START = 7; // Row 7 (0-indexed: 6)
const DATA_ROW_END = 25;  // Row 25

// DB → Google Sheets 同期
export async function syncToSheets(periodId: string): Promise<{ success: boolean; message: string }> {
  if (!isSheetsConfigured()) {
    return { success: false, message: "Google Sheets連携が未設定です。.envにGOOGLE_SHEET_ID等を設定してください。" };
  }

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: {
      store: true,
      shiftDays: {
        orderBy: { date: "asc" },
        include: {
          shiftSlots: {
            include: { cast: { select: { name: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  if (!period) return { success: false, message: "シフト期間が見つかりません" };

  // シート名を生成（例: 東中野4月後半2026）
  const halfLabel = period.half === "first" ? "前半" : "後半";
  const sheetName =
    period.sheetName || `${period.store.name}${period.month}月${halfLabel}${period.year}`;

  try {
    // 半月を2段に分割（前半7-8日 + 後半7-8日）
    const mid = Math.ceil(period.shiftDays.length / 2);
    const weeks = [period.shiftDays.slice(0, mid), period.shiftDays.slice(mid)];

    for (let weekIdx = 0; weekIdx < weeks.length; weekIdx++) {
      const week = weeks[weekIdx];
      const rowOffset = weekIdx === 0 ? 0 : 30; // 2段目は30行下

      for (let dayIdx = 0; dayIdx < week.length; dayIdx++) {
        const day = week[dayIdx];
        const colOffset = DAY_COL_OFFSETS[dayIdx];
        if (colOffset === undefined) continue;

        // 各時間スロットを書き込み
        for (let slotIdx = 0; slotIdx < TIME_SLOTS.length; slotIdx++) {
          const slot = TIME_SLOTS[slotIdx];
          const row = DATA_ROW_START + slotIdx + rowOffset;
          const slotsAtTime = day.shiftSlots.filter((s) => s.timeSlot === slot);

          // 出勤キャスト名
          const startCasts = slotsAtTime
            .filter((s) => s.isStart)
            .map((s) => s.cast.name)
            .join("\n");
          // 退勤キャスト名
          const endCasts = slotsAtTime
            .filter((s) => s.isEnd)
            .map((s) => s.cast.name)
            .join("\n");
          // 人数
          const count = slotsAtTime.length;

          const colLetter = numToCol(colOffset);
          const retireColLetter = numToCol(colOffset + 1);
          const countColLetter = numToCol(colOffset + 2);

          await writeCell(sheetName, `${colLetter}${row}`, startCasts || null);
          await writeCell(sheetName, `${retireColLetter}${row}`, endCasts || null);
          await writeCell(sheetName, `${countColLetter}${row}`, count || null);
        }

        // 集計行
        const summaryRow = DATA_ROW_END + 1 + rowOffset; // Row 26
        const totalHours = day.shiftSlots.length * 0.5;
        const budget = day.targetBudget;

        await writeCell(sheetName, `${numToCol(colOffset - 1)}${summaryRow}`, budget || null);
        await writeCell(sheetName, `${numToCol(colOffset + 1)}${summaryRow}`, totalHours || null);
        await writeCell(sheetName, `${numToCol(colOffset + 2)}${summaryRow}`, day.employeeOnDuty || null);

        // 企画名, 来店予定, 備考
        await writeCell(sheetName, `${numToCol(colOffset - 1)}${summaryRow + 1}`, day.eventName || null);
        await writeCell(sheetName, `${numToCol(colOffset - 1)}${summaryRow + 2}`, day.expectedVisitors || null);
        await writeCell(sheetName, `${numToCol(colOffset - 1)}${summaryRow + 3}`, day.notes || null);
      }
    }

    // シート名を保存
    if (!period.sheetName) {
      await prisma.shiftPeriod.update({
        where: { id: periodId },
        data: { sheetName },
      });
    }

    return { success: true, message: `${sheetName} に同期しました` };
  } catch (error: any) {
    return { success: false, message: `同期エラー: ${error.message}` };
  }
}

// Google Sheets → DB 同期
export async function syncFromSheets(periodId: string): Promise<{ success: boolean; message: string }> {
  if (!isSheetsConfigured()) {
    return { success: false, message: "Google Sheets連携が未設定です" };
  }

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: { store: true, shiftDays: { orderBy: { date: "asc" } } },
  });

  if (!period) return { success: false, message: "シフト期間が見つかりません" };

  const halfLabel = period.half === "first" ? "前半" : "後半";
  const sheetName =
    period.sheetName || `${period.store.name}${period.month}月${halfLabel}${period.year}`;

  try {
    // シート全体を読み取り
    const data = await readSheet(sheetName, "A1:AU60");

    // キャスト名 → IDのマッピングを構築
    const allCasts = await prisma.user.findMany({
      where: { role: "cast" },
      select: { id: true, name: true },
    });
    const castMap = new Map(allCasts.map((c) => [c.name, c.id]));

    const mid = Math.ceil(period.shiftDays.length / 2);
    const weeks = [period.shiftDays.slice(0, mid), period.shiftDays.slice(mid)];
    let importedSlots = 0;

    for (let weekIdx = 0; weekIdx < weeks.length; weekIdx++) {
      const week = weeks[weekIdx];
      const rowOffset = weekIdx === 0 ? 0 : 30;

      for (let dayIdx = 0; dayIdx < week.length; dayIdx++) {
        const day = week[dayIdx];
        const colOffset = DAY_COL_OFFSETS[dayIdx];
        if (colOffset === undefined) continue;

        // 既存スロットを削除
        await prisma.shiftSlot.deleteMany({ where: { dayId: day.id } });

        // 各時間スロットを読み取り
        for (let slotIdx = 0; slotIdx < TIME_SLOTS.length; slotIdx++) {
          const slot = TIME_SLOTS[slotIdx];
          const row = DATA_ROW_START - 1 + slotIdx + rowOffset; // 0-indexed

          if (!data[row]) continue;

          const startCell = data[row][colOffset];
          const endCell = data[row][colOffset + 1];

          // セル内の改行で複数キャスト名を分割
          const startNames = startCell
            ? String(startCell).split("\n").map((s) => s.trim()).filter(Boolean)
            : [];
          const endNames = endCell
            ? String(endCell).split("\n").map((s) => s.trim()).filter(Boolean)
            : [];

          for (const name of startNames) {
            const castId = castMap.get(name);
            if (castId) {
              await prisma.shiftSlot.create({
                data: { dayId: day.id, timeSlot: slot, castId, isStart: true },
              });
              importedSlots++;
            }
          }

          // 退勤のみ（出勤なし）のキャストも記録
          for (const name of endNames) {
            const castId = castMap.get(name);
            if (castId) {
              const existing = await prisma.shiftSlot.findFirst({
                where: { dayId: day.id, timeSlot: slot, castId },
              });
              if (existing) {
                await prisma.shiftSlot.update({
                  where: { id: existing.id },
                  data: { isEnd: true },
                });
              }
            }
          }
        }

        // 集計情報を読み取り
        const summaryRow = DATA_ROW_END + rowOffset; // 0-indexed
        if (data[summaryRow]) {
          const budget = data[summaryRow][colOffset - 1];
          const employee = data[summaryRow][colOffset + 2];
          await prisma.shiftDay.update({
            where: { id: day.id },
            data: {
              targetBudget: budget ? Number(budget) : null,
              employeeOnDuty: employee ? String(employee) : null,
            },
          });
        }
      }
    }

    return { success: true, message: `${sheetName} から ${importedSlots} スロットを取り込みました` };
  } catch (error: any) {
    return { success: false, message: `同期エラー: ${error.message}` };
  }
}

// 列番号を列文字に変換 (0=A, 1=B, 26=AA)
function numToCol(n: number): string {
  let result = "";
  let num = n;
  while (num >= 0) {
    result = String.fromCharCode((num % 26) + 65) + result;
    num = Math.floor(num / 26) - 1;
  }
  return result;
}
