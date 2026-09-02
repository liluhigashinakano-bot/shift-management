import { prisma } from "./db";
import { readSheet, writeCells, isSheetsConfigured } from "./google-sheets";
import { TIME_SLOTS, displaySlotForClockOut } from "./shift-utils";
import { slotsForRange, type NewSlot } from "./shift-slot-writer";

// Google Sheetsのシート構造（Excel準拠）
// Row 2: 日付番号（B2, H2, N2, T2, Z2, AF2, AL2, AR2）
// Row 4: 曜日
// Row 6: ヘッダー（時間, 出勤, 退勤, 人数, メモ）
// Rows 7〜: 19:00〜29:00 のスロット（TIME_SLOTS 行数）
// 集計行は最終スロットの次の行
// 2段目ブロックは 1段目より 32 行下（スロット行が増えた分を反映）

// 各日の開始列（0-indexed）: 1, 7, 13, 19, 25, 31, 37, 43（8日分）
const DAY_COL_OFFSETS = [1, 7, 13, 19, 25, 31, 37, 43];
const DATA_ROW_START = 7; // Excel 行番号（1-based）: 最初のスロット行
/** 集計行（Excel 1-based）= 最終スロットの次 */
const summaryRow1Based = (rowOffset: number) => DATA_ROW_START + TIME_SLOTS.length + rowOffset;
/** 集計行（readSheet の 0-indexed 行） */
const summaryRow0Indexed = (rowOffset: number) =>
  DATA_ROW_START - 1 + TIME_SLOTS.length + rowOffset;

type CellUpdate = { cell: string; value: string | number | null };

/** ShiftDay.notes は {"text":..., "slotMemos":{...}} の JSON。シートには text だけ出す */
function dayNotesText(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { text?: unknown } | null;
    if (parsed && typeof parsed === "object") {
      return typeof parsed.text === "string" ? parsed.text : "";
    }
    return "";
  } catch {
    // 旧形式（ただのテキスト）
    return raw;
  }
}

// DB → Google Sheets 同期
export async function syncToSheets(
  periodId: string,
): Promise<{ success: boolean; message: string }> {
  if (!isSheetsConfigured()) {
    return {
      success: false,
      message: "Google Sheets連携が未設定です。.envにGOOGLE_SHEET_ID等を設定してください。",
    };
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

  const wishEnd29 = await prisma.shiftRequest.findMany({
    where: { periodId, endTime: 29 },
    select: { castId: true, date: true },
  });
  const hideEndNameSet = new Set(
    wishEnd29.map((r) => `${r.castId}|${new Date(r.date).toISOString().slice(0, 10)}`),
  );

  // シート名を生成（例: 東中野4月後半2026）
  const halfLabel = period.half === "first" ? "前半" : "後半";
  const sheetName =
    period.sheetName || `${period.store.name}${period.month}月${halfLabel}${period.year}`;

  try {
    // 半月を2段に分割（前半7-8日 + 後半7-8日）
    const mid = Math.ceil(period.shiftDays.length / 2);
    const weeks = [period.shiftDays.slice(0, mid), period.shiftDays.slice(mid)];

    // 1 セルずつ送らず、まとめて 1 回で書き込む
    const updates: CellUpdate[] = [];

    for (let weekIdx = 0; weekIdx < weeks.length; weekIdx++) {
      const week = weeks[weekIdx]!;
      const rowOffset = weekIdx === 0 ? 0 : 32; // 2段目

      for (let dayIdx = 0; dayIdx < week.length; dayIdx++) {
        const day = week[dayIdx]!;
        const colOffset = DAY_COL_OFFSETS[dayIdx];
        if (colOffset === undefined) continue;

        const dateKey = new Date(day.date).toISOString().slice(0, 10);

        for (let slotIdx = 0; slotIdx < TIME_SLOTS.length; slotIdx++) {
          const slot = TIME_SLOTS[slotIdx]!;
          const row = DATA_ROW_START + slotIdx + rowOffset;
          const slotsAtTime = day.shiftSlots.filter((s) => s.timeSlot === slot);

          // 出勤キャスト名
          const startCasts = slotsAtTime
            .filter((s) => s.isStart)
            .map((s) => s.cast.name)
            .join("\n");
          // 退勤キャスト名（整数時退勤は :00 行に合わせる／希望退勤29:00 かつ 実退勤も29:00 のときのみ名前を出さない）
          const endCasts = day.shiftSlots
            .filter(
              (s) => s.isEnd && displaySlotForClockOut(day.shiftSlots, s.castId) === slot,
            )
            .filter((s) => {
              if (slot !== 29) return true;
              return !hideEndNameSet.has(`${s.castId}|${dateKey}`);
            })
            .map((s) => s.cast.name)
            .join("\n");
          const count = slotsAtTime.length;

          updates.push(
            { cell: `${numToCol(colOffset)}${row}`, value: startCasts || null },
            { cell: `${numToCol(colOffset + 1)}${row}`, value: endCasts || null },
            { cell: `${numToCol(colOffset + 2)}${row}`, value: count || null },
          );
        }

        // 集計行
        const summaryRow = summaryRow1Based(rowOffset);
        const totalHours = day.shiftSlots.length * 0.5;
        const budget = totalHours > 0 ? totalHours * 6000 : 0;

        updates.push(
          { cell: `${numToCol(colOffset - 1)}${summaryRow}`, value: budget || null },
          { cell: `${numToCol(colOffset + 1)}${summaryRow}`, value: totalHours || null },
          {
            cell: `${numToCol(colOffset + 2)}${summaryRow}`,
            value: day.employeeOnDuty || null,
          },
          // 企画名, 来店予定, 備考
          {
            cell: `${numToCol(colOffset - 1)}${summaryRow + 1}`,
            value: day.eventName || null,
          },
          {
            cell: `${numToCol(colOffset - 1)}${summaryRow + 2}`,
            value: day.expectedVisitors || null,
          },
          // ⚠️ notes は JSON なので、そのまま書くと {"slotMemos":...} がシートに出る
          {
            cell: `${numToCol(colOffset - 1)}${summaryRow + 3}`,
            value: dayNotesText(day.notes) || null,
          },
        );
      }
    }

    await writeCells(sheetName, updates);

    // シート名を保存
    if (!period.sheetName) {
      await prisma.shiftPeriod.update({
        where: { id: periodId },
        data: { sheetName },
      });
    }

    return { success: true, message: `${sheetName} に同期しました` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    console.error("[sheet-sync toSheets]", error);
    return { success: false, message: `同期エラー: ${message}` };
  }
}

// Google Sheets → DB 同期
export async function syncFromSheets(
  periodId: string,
): Promise<{ success: boolean; message: string }> {
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
      where: { role: "cast", isTrialGuest: false },
      select: { id: true, name: true },
    });
    const castMap = new Map(allCasts.map((c) => [c.name, c.id]));

    const mid = Math.ceil(period.shiftDays.length / 2);
    const weeks = [period.shiftDays.slice(0, mid), period.shiftDays.slice(mid)];
    let importedCasts = 0;
    const problems: string[] = [];

    for (let weekIdx = 0; weekIdx < weeks.length; weekIdx++) {
      const week = weeks[weekIdx]!;
      const rowOffset = weekIdx === 0 ? 0 : 32;

      for (let dayIdx = 0; dayIdx < week.length; dayIdx++) {
        const day = week[dayIdx]!;
        const colOffset = DAY_COL_OFFSETS[dayIdx];
        if (colOffset === undefined) continue;

        // 出勤・退勤の行から、キャストごとの [出勤, 退勤) を組み立てる。
        // 以前は出勤の 30 分ぶんだけ作っていたため、退勤までの時間が入らなかった。
        const startByCast = new Map<string, number>();
        const endByCast = new Map<string, number>();
        const namesSeen = new Set<string>();

        for (let slotIdx = 0; slotIdx < TIME_SLOTS.length; slotIdx++) {
          const slot = TIME_SLOTS[slotIdx]!;
          const row = DATA_ROW_START - 1 + slotIdx + rowOffset; // 0-indexed
          const rowData = data[row];
          if (!rowData) continue;

          const startCell = rowData[colOffset];
          const endCell = rowData[colOffset + 1];

          const splitNames = (cell: unknown): string[] =>
            cell
              ? String(cell)
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];

          for (const name of splitNames(startCell)) {
            namesSeen.add(name);
            const castId = castMap.get(name);
            if (castId && !startByCast.has(castId)) startByCast.set(castId, slot);
          }
          for (const name of splitNames(endCell)) {
            namesSeen.add(name);
            const castId = castMap.get(name);
            // 同じ人が複数回出てきたら、いちばん遅い退勤を採る
            if (castId) endByCast.set(castId, slot);
          }
        }

        const dateLabel = `${new Date(day.date).getMonth() + 1}/${new Date(day.date).getDate()}`;
        for (const name of namesSeen) {
          if (!castMap.has(name)) {
            problems.push(`${dateLabel} 不明なキャスト名: ${name}`);
          }
        }

        const newSlots: NewSlot[] = [];
        for (const [castId, start] of startByCast) {
          const end = endByCast.get(castId);
          if (end === undefined) {
            const name = allCasts.find((c) => c.id === castId)?.name ?? castId;
            problems.push(`${dateLabel} ${name}: 退勤が読み取れないため取り込みませんでした`);
            continue;
          }
          if (end <= start) {
            const name = allCasts.find((c) => c.id === castId)?.name ?? castId;
            problems.push(`${dateLabel} ${name}: 退勤が出勤より前です`);
            continue;
          }
          newSlots.push(...slotsForRange(day.id, castId, start, end, null));
          importedCasts++;
        }

        // 集計情報を読み取り
        const summaryRow = summaryRow0Indexed(rowOffset);
        const summaryData = data[summaryRow];
        const budgetRaw = summaryData?.[colOffset - 1];
        const employeeRaw = summaryData?.[colOffset + 2];
        const budget =
          budgetRaw != null && budgetRaw !== "" && Number.isFinite(Number(budgetRaw))
            ? Math.round(Number(budgetRaw))
            : null;

        await prisma.$transaction(async (tx) => {
          await tx.shiftSlot.deleteMany({ where: { dayId: day.id } });
          if (newSlots.length > 0) {
            await tx.shiftSlot.createMany({ data: newSlots });
          }
          if (summaryData) {
            await tx.shiftDay.update({
              where: { id: day.id },
              data: {
                targetBudget: budget,
                employeeOnDuty: employeeRaw ? String(employeeRaw) : null,
              },
            });
          }
        });
      }
    }

    const problemPart =
      problems.length > 0 ? `／注意: ${problems.slice(0, 5).join("；")}` : "";
    return {
      success: true,
      message: `${sheetName} から ${importedCasts} 人分を取り込みました${problemPart}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    console.error("[sheet-sync fromSheets]", error);
    return { success: false, message: `同期エラー: ${message}` };
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
