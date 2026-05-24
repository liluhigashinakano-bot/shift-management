import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { castSuffixForShiftBadge } from "@/lib/cast-display-name";
import {
  halfLabel,
  periodIndex,
  type ShiftHalf,
  type ShiftPeriodKey,
} from "@/lib/period-utils";
import { getAccessibleStoreIds } from "@/lib/store-access";

export const dynamic = "force-dynamic";

type CastCsvSummary = {
  castId: string;
  name: string;
  storeName: string | null;
  slotCount: number;
  dayKeys: Set<string>;
};

type CastCsvRow = {
  period: ShiftPeriodKey;
  periodLabel: string;
  shiftStoreName: string;
  castName: string;
  workDays: number;
  homeStoreName: string | null;
  totalHours: number;
};

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function formatCsvNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildCsv(rows: CastCsvRow[]): string {
  const header = [
    "対象期間",
    "シフト表店舗",
    "キャスト名",
    "出勤日数",
    "所属店舗",
    "総労働時間(h)",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.periodLabel,
        row.shiftStoreName,
        row.castName,
        row.workDays,
        row.homeStoreName ?? "",
        formatCsvNumber(row.totalHours),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const role = (session.user as any).role as string | undefined;
  if (role === "cast") {
    return new Response("Forbidden", { status: 403 });
  }

  const allStores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const allowedIds = getAccessibleStoreIds(session.user as any);
  const stores =
    allowedIds === null
      ? allStores
      : allStores.filter((store) => allowedIds.includes(store.id));
  const storeIds = stores.map((store) => store.id);

  const yearParam = req.nextUrl.searchParams.get("year");
  const yearFilter = yearParam ? Number(yearParam) : null;

  const castRows = await prisma.user.findMany({
    where: {
      role: "cast",
      isTrialGuest: false,
      ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : { id: "__none__" }),
    },
    select: {
      id: true,
      name: true,
      storeId: true,
      store: { select: { name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
  });
  const castsByStoreId = new Map<string, typeof castRows>();
  for (const cast of castRows) {
    if (!cast.storeId) continue;
    if (!castsByStoreId.has(cast.storeId)) castsByStoreId.set(cast.storeId, []);
    castsByStoreId.get(cast.storeId)!.push(cast);
  }

  const periods = storeIds.length
    ? await prisma.shiftPeriod.findMany({
        where: {
          storeId: { in: storeIds },
          ...(yearFilter && Number.isInteger(yearFilter) ? { year: yearFilter } : {}),
        },
        orderBy: [{ year: "asc" }, { month: "asc" }, { half: "asc" }, { store: { name: "asc" } }],
        include: {
          store: { select: { name: true } },
          shiftDays: {
            select: {
              date: true,
              shiftSlots: {
                include: {
                  cast: {
                    select: {
                      id: true,
                      name: true,
                      isTrialGuest: true,
                      store: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const rows: CastCsvRow[] = [];
  for (const period of periods) {
    const summaries = new Map<string, CastCsvSummary>();
    const ensureSummary = (
      castId: string,
      name: string,
      storeName: string | null,
    ) => {
      const existing = summaries.get(castId);
      if (existing) return existing;
      const summary: CastCsvSummary = {
        castId,
        name,
        storeName,
        slotCount: 0,
        dayKeys: new Set<string>(),
      };
      summaries.set(castId, summary);
      return summary;
    };

    for (const cast of castsByStoreId.get(period.storeId) ?? []) {
      ensureSummary(cast.id, cast.name, cast.store?.name ?? null);
    }

    for (const day of period.shiftDays) {
      const dayKey = day.date.toISOString().slice(0, 10);
      for (const slot of day.shiftSlots) {
        const summary = ensureSummary(
          slot.castId,
          castSuffixForShiftBadge(slot.cast),
          slot.cast.store?.name ?? null,
        );
        summary.slotCount += 1;
        summary.dayKeys.add(dayKey);
      }
    }

    const periodKey: ShiftPeriodKey = {
      year: period.year,
      month: period.month,
      half: period.half as ShiftHalf,
    };
    const periodLabel = `${period.year}年${period.month}月${halfLabel(periodKey.half)}`;
    const periodRows = [...summaries.values()].sort((a, b) => {
      const hourDiff = b.slotCount - a.slotCount;
      if (hourDiff !== 0) return hourDiff;
      const storeCompare = (a.storeName ?? "").localeCompare(b.storeName ?? "", "ja");
      if (storeCompare !== 0) return storeCompare;
      return a.name.localeCompare(b.name, "ja");
    });

    for (const row of periodRows) {
      rows.push({
        period: periodKey,
        periodLabel,
        shiftStoreName: period.store.name,
        castName: row.name,
        workDays: row.dayKeys.size,
        homeStoreName: row.storeName,
        totalHours: row.slotCount * 0.5,
      });
    }
  }

  rows.sort((a, b) => {
    const periodCompare = periodIndex(a.period) - periodIndex(b.period);
    if (periodCompare !== 0) return periodCompare;
    const shiftStoreCompare = a.shiftStoreName.localeCompare(b.shiftStoreName, "ja");
    if (shiftStoreCompare !== 0) return shiftStoreCompare;
    const hourDiff = b.totalHours - a.totalHours;
    if (hourDiff !== 0) return hourDiff;
    return a.castName.localeCompare(b.castName, "ja");
  });

  const csv = buildCsv(rows);
  const filename = yearFilter && Number.isInteger(yearFilter)
    ? `全店舗_キャスト総労働時間_半月別_${yearFilter}年.csv`
    : "全店舗_キャスト総労働時間_半月別.csv";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="work-hours.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
