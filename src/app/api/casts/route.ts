import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashSync } from "bcryptjs";
import { auth } from "@/lib/auth";
import crypto from "crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  findExistingCastForCreate,
  findExistingCastForUpdate,
} from "@/lib/cast-duplicate-query";
import { createCastUserRecord } from "@/lib/cast-create-user";

function requireStaffRead(session: any) {
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any).role as string | undefined;
  if (role !== "admin" && role !== "employee" && role !== "viewer") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, role };
}

function requireStaffWrite(session: any) {
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any).role as string | undefined;
  if (role !== "admin" && role !== "employee") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, role };
}

/** キャスト追加・再発行と同じ6桁数字PIN */
function generateCastPin(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// GET: キャスト一覧取得
export async function GET(req: NextRequest) {
  const session = await auth();
  const guard = requireStaffRead(session);
  if (!guard.ok) return guard.res;

  const casts = await prisma.user.findMany({
    where: { role: "cast" },
    include: { store: { select: { id: true, name: true } } },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
  });
  return NextResponse.json(casts);
}

function normalizeStoreId(storeId: unknown): string | null {
  if (storeId == null) return null;
  const s = String(storeId).trim();
  return s.length > 0 ? s : null;
}

// POST: キャスト作成/更新/削除
async function handleCastsPost(req: NextRequest): Promise<Response> {
  const session = await auth();
  const guard = requireStaffWrite(session);
  if (!guard.ok) return guard.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const { action } = body;

  if (action === "create") {
    const { name, storeId, castLoginId, password } = body as {
      name?: string;
      storeId?: string;
      castLoginId?: string;
      password?: string;
    };
    const trimmedName = String(name ?? "").trim();
    const trimmedId = String(castLoginId ?? "").trim();
    const pw = String(password ?? "").trim();
    const sid = normalizeStoreId(storeId);
    if (!trimmedName || !trimmedId || !sid || !pw) {
      return NextResponse.json(
        { error: "キャスト名・所属店舗・キャストID・パスワードは必須です" },
        { status: 400 },
      );
    }
    const storeRow = await prisma.store.findUnique({ where: { id: sid } });
    if (!storeRow) {
      return NextResponse.json({ error: "指定の店舗が見つかりません" }, { status: 400 });
    }
    if (trimmedId.includes("@")) {
      return NextResponse.json(
        { error: "キャストIDに @ は含められません（ログイン用の短いIDを設定してください）" },
        { status: 400 },
      );
    }
    const email = `${trimmedId}@cast.local`;
    const existingCreate = await findExistingCastForCreate(email, trimmedId);
    if (existingCreate) {
      return NextResponse.json(
        { error: "同じキャストID（またはメール）のユーザーが既にいます" },
        { status: 409 },
      );
    }
    try {
      const cast = await createCastUserRecord({
        name: trimmedName,
        email,
        castLoginId: trimmedId,
        password: pw,
        storeId: sid,
      });
      return NextResponse.json({
        ok: true,
        castLoginId: trimmedId,
        cast,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          return NextResponse.json(
            { error: "同じメールまたはキャストIDのユーザーが既にいます" },
            { status: 409 },
          );
        }
      }
      console.error("[casts create]", e);
      const msg = e instanceof Error ? e.message : "登録に失敗しました";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "update") {
    const { id, name, storeId, castLoginId } = body as {
      id?: string;
      name?: string;
      storeId?: string | null;
      castLoginId?: string;
    };
    const userId = String(id ?? "").trim();
    if (!userId) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    const trimmedName = String(name ?? "").trim();
    const trimmedId = String(castLoginId ?? "").trim();
    if (!trimmedName || !trimmedId) {
      return NextResponse.json({ error: "キャスト名とキャストIDは必須です" }, { status: 400 });
    }
    if (trimmedId.includes("@")) {
      return NextResponse.json(
        { error: "キャストIDに @ は含められません" },
        { status: 400 },
      );
    }
    const sid = normalizeStoreId(storeId);
    if (sid) {
      const storeRow = await prisma.store.findUnique({ where: { id: sid } });
      if (!storeRow) {
        return NextResponse.json({ error: "指定の店舗が見つかりません" }, { status: 400 });
      }
    }
    const email = `${trimmedId}@cast.local`;
    const existingUpdate = await findExistingCastForUpdate(
      email,
      trimmedId,
      userId,
    );
    if (existingUpdate) {
      return NextResponse.json(
        { error: "同じキャストID（またはメール）のユーザーが既にいます" },
        { status: 409 },
      );
    }
    try {
      const cast = await prisma.user.update({
        where: { id: userId },
        data: {
          name: trimmedName,
          email,
          castLoginId: trimmedId,
          storeId: sid,
        },
      });
      return NextResponse.json(cast);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          return NextResponse.json(
            { error: "メールまたはキャストIDが他のユーザーと重複しています" },
            { status: 409 },
          );
        }
        if (e.code === "P2025") {
          return NextResponse.json({ error: "キャストが見つかりません" }, { status: 404 });
        }
      }
      console.error("[casts update]", e);
      const msg = e instanceof Error ? e.message : "更新に失敗しました";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "resetPassword") {
    const id = String((body as { id?: unknown }).id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    const password = generateCastPin();
    const cast = await prisma.user.update({
      where: { id },
      data: { passwordHash: hashSync(password, 10) },
    });
    return NextResponse.json({ castId: cast.id, password });
  }

  if (action === "delete") {
    const id = String((body as { id?: unknown }).id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    try {
      await prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id } });
        if (!u || u.role !== "cast") {
          throw Object.assign(new Error("NOT_CAST"), { code: "NOT_CAST" });
        }
        await tx.shiftSlot.deleteMany({ where: { castId: id } });
        await tx.shiftRequest.deleteMany({ where: { castId: id } });
        await tx.shiftAdjustment.deleteMany({ where: { castId: id } });
        await tx.user.delete({ where: { id } });
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: string }).code === "NOT_CAST") {
        return NextResponse.json({ error: "キャストが見つかりません" }, { status: 404 });
      }
      console.error("[casts delete]", e);
      const msg = e instanceof Error ? e.message : "削除に失敗しました";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    return await handleCastsPost(req);
  } catch (e) {
    console.error("[casts POST]", e);
    const msg = e instanceof Error ? e.message : "サーバーエラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
