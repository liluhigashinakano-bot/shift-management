import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertShiftRequestsUnlocked } from "@/lib/shift-request-lock";
import { assertShiftSlotsUnlocked, assertStaffShiftPeriodNotFinalized } from "@/lib/shift-slot-lock";
import { notifyCastShiftSubmitToDiscord } from "@/lib/discord-shift-submit-notify";
import { canAccessStore, canEditStore, getAccessibleStoreIds } from "@/lib/store-access";
import { getRole, type UserRole } from "@/lib/session-user";
import { toUtcDateKey } from "@/lib/shift-utils";
import { INVALID_RANGE_MESSAGE, isValidShiftRange } from "@/lib/shift-time-range";
import { slotsForRange } from "@/lib/shift-slot-writer";

function sameCalendarDay(a: Date | string, b: Date | string): boolean {
  return toUtcDateKey(a) === toUtcDateKey(b);
}

function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

function invalidRange() {
  return NextResponse.json({ error: INVALID_RANGE_MESSAGE }, { status: 400 });
}

/** キャスト: 希望締切＋表反映の締切。スタッフ: シフト確定ロック＋店舗の編集権限 */
async function assertRequestMutationAllowed(
  session: Session,
  role: UserRole | undefined,
  periodId: string,
) {
  if (role === "cast") {
    const a = await assertShiftRequestsUnlocked(periodId);
    if (a) return a;
    return assertShiftSlotsUnlocked(periodId);
  }
  if (role === "admin" || role === "employee") {
    const period = await prisma.shiftPeriod.findUnique({
      where: { id: periodId },
      select: { storeId: true },
    });
    if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });
    if (!canEditStore(session.user, period.storeId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return assertStaffShiftPeriodNotFinalized(periodId);
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** 指定日のそのキャスト分シフトスロットだけ削除（希望削除・更新前に使用） */
async function removeCastSlotsForDay(castId: string, periodId: string, date: Date) {
  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: { shiftDays: true },
  });
  if (!period) return;
  const day = period.shiftDays.find((d) => sameCalendarDay(d.date, date));
  if (!day) return;
  await prisma.shiftSlot.deleteMany({ where: { dayId: day.id, castId } });
}

// シフト希望をシフト表に即時反映するヘルパー
async function applyToShiftTable(
  castId: string,
  periodId: string,
  date: Date,
  startTime: number,
  endTime: number,
  notes?: string | null,
) {
  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: { shiftDays: true },
  });
  if (!period) return;

  const day = period.shiftDays.find((d) => sameCalendarDay(d.date, date));
  if (!day) return;

  await prisma.shiftSlot.deleteMany({ where: { dayId: day.id, castId } });

  const slots = slotsForRange(day.id, castId, startTime, endTime, notes ?? null);
  if (slots.length > 0) {
    await prisma.shiftSlot.createMany({ data: slots });
  }
}

// GET: シフト希望一覧
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const castIdParam = req.nextUrl.searchParams.get("castId");
  const role = getRole(session);
  const castId = role === "cast" ? session.user.id : castIdParam;

  const where: Record<string, unknown> = {};
  if (periodId) where.periodId = periodId;
  if (castId) where.castId = castId;

  // キャスト以外は、見られる店舗の希望だけに絞る。
  // 以前は店舗の確認が無く、住所を打てば他店舗の希望を取り出せた。
  if (role !== "cast") {
    if (periodId) {
      const period = await prisma.shiftPeriod.findUnique({
        where: { id: periodId },
        select: { storeId: true },
      });
      if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });
      if (!canAccessStore(session.user, period.storeId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      const allowed = getAccessibleStoreIds(session.user);
      if (allowed !== null) {
        where.period = { storeId: { in: allowed } };
      }
    }
  }

  const requests = await prisma.shiftRequest.findMany({
    where,
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      period: {
        select: { store: { select: { name: true } }, year: true, month: true, half: true },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json(requests);
}

// POST: シフト希望を作成/更新
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(session);
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  // 単一登録 → 即時シフト表反映
  if (action === "create") {
    const castId = String(body.castId ?? "");
    const periodId = String(body.periodId ?? "");
    const startTime = body.startTime as number;
    const endTime = body.endTime as number;
    const notes = normalizeNotes(body.notes as string | null | undefined);
    const dateRaw = body.date;

    if (role === "cast" && castId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!castId || !periodId) {
      return NextResponse.json({ error: "castId と periodId が必要です" }, { status: 400 });
    }
    if (!isValidShiftRange(startTime, endTime)) return invalidRange();

    const date = new Date(String(dateRaw));
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
    }

    const lockRes = await assertRequestMutationAllowed(session, role, periodId);
    if (lockRes) return lockRes;

    const already = await prisma.shiftRequest.findFirst({
      where: { castId, periodId, date },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json(
        { error: "その日の希望はすでに登録されています。一覧から編集してください。" },
        { status: 409 },
      );
    }

    const request = await prisma.shiftRequest.create({
      data: { castId, periodId, date, startTime, endTime, notes, status: "approved" },
    });
    await applyToShiftTable(castId, periodId, date, startTime, endTime, notes);
    await notifyCastShiftSubmitToDiscord(castId, periodId, {
      kind: "create",
      date,
      startTime,
      endTime,
      notes,
    });
    return NextResponse.json(request);
  }

  // 複数日一括登録 → 即時シフト表反映
  if (action === "bulkCreate") {
    const castId = String(body.castId ?? "");
    const periodId = String(body.periodId ?? "");
    const entries = (body.entries ?? []) as {
      date: string;
      startTime: number;
      endTime: number;
      notes?: string;
    }[];

    if (role === "cast" && castId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!castId || !periodId || !Array.isArray(entries)) {
      return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    }
    for (const e of entries) {
      if (!isValidShiftRange(e.startTime, e.endTime)) return invalidRange();
      if (Number.isNaN(new Date(e.date).getTime())) {
        return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
      }
    }

    const lockBulk = await assertRequestMutationAllowed(session, role, periodId);
    if (lockBulk) return lockBulk;

    // 同じ日が複数回あれば最後の内容を採用
    const byCalendarDay = new Map<string, (typeof entries)[number]>();
    for (const e of entries) {
      byCalendarDay.set(toUtcDateKey(e.date), e);
    }
    const merged = [...byCalendarDay.values()];
    const datesToReplace = merged.map((e) => new Date(e.date));

    const existingRequests =
      datesToReplace.length > 0
        ? await prisma.shiftRequest.findMany({
            where: { castId, periodId, date: { in: datesToReplace } },
            select: { date: true, startTime: true, endTime: true, notes: true },
          })
        : [];
    const existingByDate = new Map(
      existingRequests.map((r) => [toUtcDateKey(r.date), r]),
    );
    const changed = merged.filter((e) => {
      const existing = existingByDate.get(toUtcDateKey(e.date));
      if (!existing) return true;
      return (
        existing.startTime !== e.startTime ||
        existing.endTime !== e.endTime ||
        normalizeNotes(existing.notes) !== normalizeNotes(e.notes)
      );
    });
    const datesToChange = changed.map((e) => new Date(e.date));

    // 今回チェックした日付の希望だけ置き換え（他の日は残す）
    if (datesToChange.length > 0) {
      await prisma.shiftRequest.deleteMany({
        where: { castId, periodId, date: { in: datesToChange } },
      });
    }

    const data = changed.map((e) => ({
      castId,
      periodId,
      date: new Date(e.date),
      startTime: e.startTime,
      endTime: e.endTime,
      notes: normalizeNotes(e.notes),
      status: "approved" as const,
    }));

    if (data.length > 0) {
      await prisma.shiftRequest.createMany({ data });
    }

    for (const entry of changed) {
      await applyToShiftTable(
        castId,
        periodId,
        new Date(entry.date),
        entry.startTime,
        entry.endTime,
        entry.notes,
      );
    }

    const sortedForNotify = [...changed].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    if (sortedForNotify.length > 0) {
      await notifyCastShiftSubmitToDiscord(castId, periodId, {
        kind: "bulk",
        entries: sortedForNotify.map((e) => ({
          date: new Date(e.date),
          startTime: e.startTime,
          endTime: e.endTime,
        })),
      });
    }

    return NextResponse.json({ ok: true, count: data.length });
  }

  /** 1件の希望を書き換え（日付・時間・備考）＋シフト表を差し替え */
  if (action === "update") {
    const id = String(body.id ?? "");
    const startTime = body.startTime as number;
    const endTime = body.endTime as number;
    const nextNotes = normalizeNotes(body.notes as string | null | undefined);

    if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    if (!isValidShiftRange(startTime, endTime)) return invalidRange();

    const newDate = new Date(String(body.date));
    if (Number.isNaN(newDate.getTime())) {
      return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
    }

    const existing = await prisma.shiftRequest.findUnique({
      where: { id },
      select: {
        castId: true,
        periodId: true,
        date: true,
        startTime: true,
        endTime: true,
        notes: true,
      },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (role === "cast" && existing.castId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const lockUp = await assertRequestMutationAllowed(session, role, existing.periodId);
    if (lockUp) return lockUp;

    const movedToAnotherDay = !sameCalendarDay(existing.date, newDate);

    const hasChange =
      movedToAnotherDay ||
      existing.startTime !== startTime ||
      existing.endTime !== endTime ||
      normalizeNotes(existing.notes) !== nextNotes;

    if (!hasChange) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 付け替え先に既に希望があると、同じ日に 2 件並んで
    // 「希望から変更済」の判定がどちらを見るか定まらなくなる
    if (movedToAnotherDay) {
      const clash = await prisma.shiftRequest.findFirst({
        where: {
          castId: existing.castId,
          periodId: existing.periodId,
          date: newDate,
          NOT: { id },
        },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          {
            error:
              "移動先の日には、すでにこのキャストの希望があります。先にその希望を消してください。",
          },
          { status: 409 },
        );
      }
      await removeCastSlotsForDay(existing.castId, existing.periodId, existing.date);
    }

    await prisma.shiftRequest.update({
      where: { id },
      data: {
        date: newDate,
        startTime,
        endTime,
        notes: nextNotes,
        status: "approved",
      },
    });
    await applyToShiftTable(
      existing.castId,
      existing.periodId,
      newDate,
      startTime,
      endTime,
      nextNotes,
    );
    await notifyCastShiftSubmitToDiscord(existing.castId, existing.periodId, {
      kind: "update",
      date: newDate,
      startTime,
      endTime,
      notes: nextNotes,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateStatus") {
    // ステータス更新は管理者/社員のみ
    if (role === "cast") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!["pending", "approved", "rejected", "adjusted"].includes(status)) {
      return NextResponse.json({ error: "status が不正です" }, { status: 400 });
    }
    const row = await prisma.shiftRequest.findUnique({
      where: { id },
      select: { periodId: true },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const lockedSt = await assertRequestMutationAllowed(session, role, row.periodId);
    if (lockedSt) return lockedSt;
    await prisma.shiftRequest.update({ where: { id }, data: { status } });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    const existing = await prisma.shiftRequest.findUnique({
      where: { id },
      select: {
        castId: true,
        periodId: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (role === "cast" && existing.castId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const lockedDel = await assertRequestMutationAllowed(session, role, existing.periodId);
    if (lockedDel) return lockedDel;
    await removeCastSlotsForDay(existing.castId, existing.periodId, existing.date);
    await notifyCastShiftSubmitToDiscord(existing.castId, existing.periodId, {
      kind: "delete",
      date: existing.date,
      startTime: existing.startTime,
      endTime: existing.endTime,
    });
    await prisma.shiftRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
