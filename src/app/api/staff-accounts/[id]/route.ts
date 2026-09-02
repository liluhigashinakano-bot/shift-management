import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { hashSync } from "bcryptjs";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRole } from "@/lib/session-user";
import { isStaffAccountRole } from "@/lib/roles";
import { findExistingStaffLogin } from "@/lib/cast-duplicate-query";
import { assignmentRows, parseStaffAccountBody } from "@/lib/staff-account-input";

function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function requireAdmin(session: Session | null): boolean {
  return Boolean(session) && getRole(session) === "admin";
}

async function assertStaffUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user || !isStaffAccountRole(user.role)) {
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

  const parsed = await parseStaffAccountBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const input = parsed.value;

  // 管理者を 0 人にしない。0 人になると権限設定を誰も開けなくなり、
  // データベースを直接いじるしか戻す手が無くなる。
  if (staff.role === "admin" && input.role !== "admin") {
    const me = session?.user.id;
    if (me && me === id) {
      return NextResponse.json(
        { error: "ログイン中の自分の権限は変更できません" },
        { status: 400 },
      );
    }
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "最後の管理者の権限は変更できません（先に別の管理者を作ってください）" },
        { status: 400 },
      );
    }
  }

  const dup = await findExistingStaffLogin(input.email, input.loginId, id);
  if (dup) {
    return NextResponse.json(
      { error: "同じログインID（またはメール）のユーザーが既にいます" },
      { status: 409 },
    );
  }

  const rows = assignmentRows(input);

  await prisma.$transaction([
    prisma.userStoreAssignment.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        staffLoginId: input.loginId,
        role: input.role,
        accessAllStores: input.accessAllStores,
        editAllStores: input.editAllStores,
        storeId: input.primaryStoreId,
        assignedStores: rows.length > 0 ? { create: rows } : undefined,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    user: {
      id,
      name: input.name,
      loginId: input.loginId,
      role: input.role,
      accessAllStores: input.accessAllStores,
      editAllStores: input.editAllStores,
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
  const me = session?.user.id;
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
