import { NextRequest, NextResponse } from "next/server";
import { syncToSheets, syncFromSheets } from "@/lib/sheet-sync";
import { isSheetsConfigured } from "@/lib/google-sheets";

export async function POST(req: NextRequest) {
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
  return NextResponse.json({
    configured: isSheetsConfigured(),
    sheetId: process.env.GOOGLE_SHEET_ID ? "設定済み" : "未設定",
  });
}
