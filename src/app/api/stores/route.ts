import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

function requireAdmin(session: any) {
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any).role as string | undefined;
  if (role !== "admin") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

function requireStoreViewer(session: any) {
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any).role as string | undefined;
  if (role === "cast") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET() {
  const session = await auth();
  const guard = requireStoreViewer(session);
  if (!guard.ok) return guard.res;

  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: { where: { role: "cast" } } } } },
  });
  return NextResponse.json(
    stores.map((s) => ({ id: s.id, name: s.name, castCount: s._count.users }))
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const guard = requireAdmin(session);
  if (!guard.ok) return guard.res;

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
