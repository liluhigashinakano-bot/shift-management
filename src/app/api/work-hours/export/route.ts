import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureShiftPeriod } from "@/lib/ensure-shift-period";
import { castSuffixForShiftBadge } from "@/lib/cast-display-name";
import {
  halfLabel,
  nextPeriod,
  periodFromNow,
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

function parseStart(
  rawStart: string | null,
  defaultStart: ShiftPeriodKey,
  maxFuturePeriod: ShiftPeriodKey,
): ShiftPeriodKey {
  if (!rawStart) return defaultStart;

  const [mRaw, hRaw] = rawStart.split("-");
  const month = Number(mRaw);
  const half: ShiftHalf = hRaw === "second" ? "second" : "first";
  if (!month || month < 1 || month > 12) return defaultStart;

  const candidate = { year: defaultStart.year, month, half };
  return periodIndex(candidate) > periodIndex(maxFuturePeriod)
    ? defaultStart
    : candidate;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function formatCsvNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildCsv(rows: CastCsvSummary[]): string {
  const header = ["キャスト名", "出勤日数", "所属店舗", "総労働時間(h)"];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.name,
        row.dayKeys.size,
        row.storeName ?? "",
        formatCsvNumber(row.slotCount * 0.5),
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

  const now = new Date();
  const currentPeriod = periodFromNow(now);
  const maxFuturePeriod = nextPeriod(currentPeriod);
  const defaultStart: ShiftPeriodKey =
    periodIndex(currentPeriod) <= periodIndex(maxFuturePeriod)
      ? currentPeriod
      : { year: currentPeriod.year, month: maxFuturePeriod.month, half: "first" };
  const selectedStart = parseStart(
    req.nextUrl.searchParams.get("start"),
    defaultStart,
    maxFuturePeriod,
  );
  const selectedNext = nextPeriod(selectedStart);
  const displayPeriods =
    periodIndex(selectedNext) <= periodIndex(maxFuturePeriod)
      ? [selectedStart, selectedNext]
      : [selectedStart];

  for (const store of stores) {
    for (const period of displayPeriods) {
      await ensureShiftPeriod(store.id, period.year, period.month, period.half);
    }
  }

  const castRows = await prisma.user.findMany({
    where: {
      role: "cast",
      isTrialGuest: false,
      ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : { id: "__none__" }),
    },
    select: {
      id: true,
      name: true,
      store: { select: { name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
  });

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

  for (const cast of castRows) {
    ensureSummary(cast.id, cast.name, cast.store?.name ?? null);
  }

  const periods = storeIds.length
    ? await prisma.shiftPeriod.findMany({
        where: {
          storeId: { in: storeIds },
          OR: displayPeriods.map((period) => ({
            year: period.year,
            month: period.month,
            half: period.half,
          })),
        },
        include: {
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

  for (const period of periods) {
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
  }

  const rows = [...summaries.values()].sort((a, b) => {
    const storeCompare = (a.storeName ?? "").localeCompare(b.storeName ?? "", "ja");
    if (storeCompare !== 0) return storeCompare;
    return a.name.localeCompare(b.name, "ja");
  });
  const csv = buildCsv(rows);
  const periodLabel = displayPeriods
    .map((period) => `${period.year}年${period.month}月${halfLabel(period.half)}`)
    .join("_");
  const filename = `全店舗_キャスト総労働時間_${periodLabel}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="work-hours.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
