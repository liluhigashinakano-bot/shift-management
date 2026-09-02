import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getRole } from "@/lib/session-user";
import { Prisma } from "@/generated/prisma/client";

function requireAdmin(session: Session | null) {
  if (!session) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (getRole(session) !== "admin") {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const };
}

function requireStoreViewer(session: Session | null) {
  if (!session) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (getRole(session) === "cast") {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const };
}

/** 店舗名の確かめ。前後の空白を取り、空と重複を弾く */
async function validateStoreName(
  raw: unknown,
  excludeId?: string,
): Promise<{ ok: true; name: string } | { ok: false; res: NextResponse }> {
  const name = String(raw ?? "").trim();
  if (!name) {
    return {
      ok: false,
      res: NextResponse.json({ error: "店舗名を入力してください" }, { status: 400 }),
    };
  }
  if (name.length > 50) {
    return {
      ok: false,
      res: NextResponse.json({ error: "店舗名は50文字までです" }, { status: 400 }),
    };
  }
  const existing = await prisma.store.findFirst({
    where: { name, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      res: NextResponse.json({ error: "その店舗名は既にあります" }, { status: 409 }),
    };
  }
  return { ok: true, name };
}

export async function GET() {
  const session = await auth();
  const guard = requireStoreViewer(session);
  if (!guard.ok) return guard.res;

  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: { where: { role: "cast", isTrialGuest: false } } } },
    },
  });
  return NextResponse.json(
    stores.map((s) => ({ id: s.id, name: s.name, castCount: s._count.users })),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const guard = requireAdmin(session);
  if (!guard.ok) return guard.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "create") {
      const checked = await validateStoreName(body.name);
      if (!checked.ok) return checked.res;
      const store = await prisma.store.create({ data: { name: checked.name } });
      return NextResponse.json(store);
    }

    if (action === "update") {
      const id = String(body.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
      const checked = await validateStoreName(body.name, id);
      if (!checked.ok) return checked.res;
      const store = await prisma.store.update({
        where: { id },
        data: { name: checked.name },
      });
      return NextResponse.json(store);
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json({ error: "その店舗名は既にあります" }, { status: 409 });
      }
      if (e.code === "P2025") {
        return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 });
      }
    }
    console.error("[stores POST]", e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
