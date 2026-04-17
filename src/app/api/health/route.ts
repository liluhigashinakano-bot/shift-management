import { NextResponse } from "next/server";

/** Railway / ロードバランサ用（認証なしで 200 を返す） */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
