import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { hashSync } from "bcryptjs";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRole } from "@/lib/session-user";
import { findExistingStaffLogin } from "@/lib/cast-duplicate-query";
import { assignmentRows, parseStaffAccountBody } from "@/lib/staff-account-input";

export const dynamic = "force-dynamic";

function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function displayLoginId(staffLoginId: string | null, email: string): string | null {
  if (staffLoginId && staffLoginId.length > 0) return staffLoginId;
  if (email.endsWith("@staff.local")) {
    return email.slice(0, -"@staff.local".length) || null;
  }
  return null;
}

function requireAdmin(session: Session | null): boolean {
  return Boolean(session) && getRole(session) === "admin";
}

/** 管理者・従業員・閲覧者の一覧 */
export async function GET() {
  const session = await auth();
  const role = getRole(session);
  if (!session || (role !== "admin" && role !== "viewer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { role: { in: ["admin", "employee", "viewer"] } },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      staffLoginId: true,
      accessAllStores: true,
      editAllStores: true,
      storeId: true,
      assignedStores: { select: { storeId: true, canEdit: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      loginId: displayLoginId(u.staffLoginId, u.email),
      email: u.email,
      accessAllStores: u.accessAllStores,
      editAllStores: u.editAllStores,
      storeId: u.storeId,
      assignedStoreIds: u.assignedStores.map((a) => a.storeId),
      editableStoreIds: u.assignedStores.filter((a) => a.canEdit).map((a) => a.storeId),
    })),
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!requireAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // キャストID とも突き合わせる。同じ文字だとキャストがログインできなくなる
  const dupLogin = await findExistingStaffLogin(input.email, input.loginId);
  if (dupLogin) {
    return NextResponse.json(
      { error: "同じログインID（またはメール）のユーザーが既にいます" },
      { status: 409 },
    );
  }

  const password = generatePassword();
  const passwordHash = hashSync(password, 10);
  const rows = assignmentRows(input);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      staffLoginId: input.loginId,
      passwordHash,
      role: input.role,
      accessAllStores: input.accessAllStores,
      editAllStores: input.editAllStores,
      storeId: input.primaryStoreId,
      assignedStores: rows.length > 0 ? { create: rows } : undefined,
    },
    select: { id: true, name: true, role: true, accessAllStores: true, editAllStores: true },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      loginId: input.loginId,
      role: user.role,
      accessAllStores: user.accessAllStores,
      editAllStores: user.editAllStores,
    },
    password,
  });
}
