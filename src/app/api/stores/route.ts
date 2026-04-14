import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: { where: { role: "cast" } } } } },
  });
  return NextResponse.json(
    stores.map((s) => ({ id: s.id, name: s.name, castCount: s._count.users }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const store = await prisma.store.create({ data: { name: body.name } });
    return NextResponse.json(store);
  }

  if (action === "update") {
    const store = await prisma.store.update({
      where: { id: body.id },
      data: { name: body.name },
    });
    return NextResponse.json(store);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
