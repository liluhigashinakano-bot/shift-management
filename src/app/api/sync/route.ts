import { NextRequest, NextResponse } from "next/server";
import { syncToSheets, syncFromSheets } from "@/lib/sheet-sync";
import { isSheetsConfigured } from "@/lib/google-sheets";
import { auth } from "@/lib/auth";

function requireStaff(session: any) {
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any).role as string | undefined;
  if (role !== "admin" && role !== "employee") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const guard = requireStaff(session);
  if (!guard.ok) return guard.res;

  const body = await req.json();
  const { direction, periodId } = body;

  if (!periodId) {
    return NextResponse.json({ error: "periodId required" }, { status: 400 });
  }

  if (direction === "toSheets") {
    const result = await syncToSheets(periodId);
    return NextResponse.json(result);
  }

  if (direction === "fromSheets") {
    const result = await syncFromSheets(periodId);
    return NextResponse.json(result);
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
