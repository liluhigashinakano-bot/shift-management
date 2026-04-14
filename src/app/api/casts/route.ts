import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashSync } from "bcryptjs";

// GET: キャスト一覧取得
export async function GET(req: NextRequest) {
  const casts = await prisma.user.findMany({
    where: { role: "cast" },
    include: { store: { select: { id: true, name: true } } },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
  });
  return NextResponse.json(casts);
}

// POST: キャスト作成/更新/削除
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const { name, email, storeId, hourlyRate, posId } = body;
    const cast = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashSync("cast123", 10),
        role: "cast",
        storeId: storeId || null,
        hourlyRate: hourlyRate ? parseInt(hourlyRate) : null,
        posId: posId || null,
      },
    });
    return NextResponse.json(cast);
  }

  if (action === "update") {
    const { id, name, email, storeId, hourlyRate, posId } = body;
    const cast = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        storeId: storeId || null,
        hourlyRate: hourlyRate ? parseInt(hourlyRate) : null,
        posId: posId || null,
      },
    });
    return NextResponse.json(cast);
  }

  if (action === "delete") {
    await prisma.user.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
