import { NextRequest, NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function requireAdmin(session: { user?: { role?: string } } | null) {
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return false;
  }
  return true;
}

async function assertStaffUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user || !["admin", "employee", "viewer"].includes(user.role)) {
    return null;
  }
  return user;
}

/** パスワードのみ再生成 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!requireAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const staff = await assertStaffUser(id);
  if (!staff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "resetPassword") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const password = generatePassword();
  const passwordHash = hashSync(password, 10);
  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true, password });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!requireAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const staff = await assertStaffUser(id);
  if (!staff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const roleIn = String(body.role ?? "").trim();
  const loginId = String(body.loginId ?? "").trim().toLowerCase();
  const accessAllStores = Boolean(body.accessAllStores);
  const storeIdsRaw = body.storeIds;
  const storeIds = Array.isArray(storeIdsRaw)
    ? storeIdsRaw.map((x) => String(x).trim()).filter(Boolean)
    : [];

  if (!name || !loginId) {
    return NextResponse.json({ error: "名前とIDは必須です" }, { status: 400 });
  }
  if (!["admin", "employee", "viewer"].includes(roleIn)) {
    return NextResponse.json({ error: "権限の指定が不正です" }, { status: 400 });
  }
  if (loginId.includes("@") || /\s/.test(loginId)) {
    return NextResponse.json(
      { error: "ID に @ や空白は使えません" },
      { status: 400 },
    );
  }

  const email = `${loginId}@staff.local`;
  const dup = await prisma.user.findFirst({
    where: {
      OR: [{ staffLoginId: loginId }, { email }],
      NOT: { id },
    },
  });
  if (dup) {
    return NextResponse.json(
      { error: "同じログインID（またはメール）のユーザーが既にいます" },
      { status: 409 },
    );
  }

  const allStores = await prisma.store.findMany({ select: { id: true } });
  const valid = new Set(allStores.map((s) => s.id));
  for (const sid of storeIds) {
    if (!valid.has(sid)) {
      return NextResponse.json({ error: "無効な店舗IDが含まれています" }, { status: 400 });
    }
  }

  const isAdminRole = roleIn === "admin";
  const effectiveAll = isAdminRole ? true : accessAllStores;
  if (!effectiveAll && storeIds.length === 0) {
    return NextResponse.json(
      { error: "所属店舗を1つ以上選ぶか、「全店舗」を指定してください" },
      { status: 400 },
    );
  }

  const primaryStoreId =
    effectiveAll || storeIds.length === 0 ? null : storeIds[0] ?? null;

  await prisma.$transaction([
    prisma.userStoreAssignment.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        staffLoginId: loginId,
        role: roleIn,
        accessAllStores: effectiveAll,
        storeId: primaryStoreId,
        assignedStores:
          !effectiveAll && storeIds.length > 0
            ? { create: storeIds.map((storeId) => ({ storeId })) }
            : undefined,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    user: {
      id,
      name,
      loginId,
      role: roleIn,
      accessAllStores: effectiveAll,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!requireAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const me = session?.user ? (session.user as { id?: string }).id : undefined;
  if (me && id === me) {
    return NextResponse.json(
      { error: "ログイン中の自分自身は削除できません" },
      { status: 400 },
    );
  }

  const staff = await assertStaffUser(id);
  if (!staff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (staff.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "最後の管理者アカウントは削除できません" },
        { status: 400 },
      );
    }
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code: string }).code
        : "";
    if (code === "P2003") {
      return NextResponse.json(
        {
          error:
            "このユーザーに紐づくデータがあるため削除できません（シフト希望などを先に整理してください）",
        },
        { status: 409 },
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
