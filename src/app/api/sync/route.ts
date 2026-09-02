import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { syncToSheets, syncFromSheets } from "@/lib/sheet-sync";
import { isSheetsConfigured } from "@/lib/google-sheets";
import { auth } from "@/lib/auth";
import { assertStaffShiftPeriodNotFinalized } from "@/lib/shift-slot-lock";
import { prisma } from "@/lib/db";
import { canEditStore } from "@/lib/store-access";
import { getRole } from "@/lib/session-user";

function requireStaff(session: Session | null) {
  if (!session) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const role = getRole(session);
  if (role !== "admin" && role !== "employee") {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const guard = requireStaff(session);
  if (!guard.ok) return guard.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const direction = typeof body.direction === "string" ? body.direction : "";
  const periodId = typeof body.periodId === "string" ? body.periodId : "";

  if (!periodId) {
    return NextResponse.json({ error: "periodId required" }, { status: 400 });
  }

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { storeId: true },
  });
  if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });
  if (!canEditStore(session!.user, period.storeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (direction === "toSheets") {
    const result = await syncToSheets(periodId);
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  }

  if (direction === "fromSheets") {
    const slotLock = await assertStaffShiftPeriodNotFinalized(periodId);
    if (slotLock) return slotLock;
    const result = await syncFromSheets(periodId);
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  }

  return NextResponse.json({ error: "Unknown direction" }, { status: 400 });
}

export async function GET() {
  const session = await auth();
  const guard = requireStaff(session);
  if (!guard.ok) return guard.res;

  return NextResponse.json({
    configured: isSheetsConfigured(),
    sheetId: process.env.GOOGLE_SHEET_ID ? "設定済み" : "未設定",
  });
}
