import { NextRequest, NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function displayLoginId(
  staffLoginId: string | null,
  email: string,
): string | null {
  if (staffLoginId && staffLoginId.length > 0) return staffLoginId;
  if (email.endsWith("@staff.local")) {
    return email.slice(0, -"@staff.local".length) || null;
  }
  return null;
}

/** 管理者・従業員・閲覧者の一覧 */
export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
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
      editableStoreIds: u.assignedStores
        .filter((a) => a.canEdit)
        .map((a) => a.storeId),
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
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const editAllStores = Boolean(body.editAllStores);
  const viewStoreIdsRaw = body.viewStoreIds ?? body.storeIds;
  const editStoreIdsRaw = body.editStoreIds ?? body.storeIds;
  const viewStoreIds = Array.isArray(viewStoreIdsRaw)
    ? viewStoreIdsRaw.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const editStoreIds = Array.isArray(editStoreIdsRaw)
    ? editStoreIdsRaw.map((x) => String(x).trim()).filter(Boolean)
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
  const dupLogin = await prisma.user.findFirst({
    where: { OR: [{ staffLoginId: loginId }, { email }] },
  });
  if (dupLogin) {
    return NextResponse.json(
      { error: "同じログインID（またはメール）のユーザーが既にいます" },
      { status: 409 },
    );
  }

  const allStores = await prisma.store.findMany({ select: { id: true } });
  const valid = new Set(allStores.map((s) => s.id));
  const requestedStoreIds = [...new Set([...viewStoreIds, ...editStoreIds])];
  for (const sid of requestedStoreIds) {
    if (!valid.has(sid)) {
      return NextResponse.json({ error: "無効な店舗IDが含まれています" }, { status: 400 });
    }
  }

  const isAdminRole = roleIn === "admin";
  const effectiveEditAll = isAdminRole ? true : roleIn === "employee" && editAllStores;
  const effectiveAll = isAdminRole ? true : accessAllStores || effectiveEditAll;
  const assignedStoreIds = effectiveAll
    ? [...new Set(editStoreIds)]
    : requestedStoreIds;
  if (!effectiveAll && assignedStoreIds.length === 0) {
    return NextResponse.json(
      { error: "所属店舗を1つ以上選ぶか、「全店舗」を指定してください" },
      { status: 400 },
    );
  }
  if (roleIn === "viewer" && (effectiveEditAll || editStoreIds.length > 0)) {
    return NextResponse.json(
      { error: "閲覧者には編集権限を付与できません" },
      { status: 400 },
    );
  }

  const password = generatePassword();
  const passwordHash = hashSync(password, 10);

  const primaryStoreId =
    effectiveAll || assignedStoreIds.length === 0 ? null : assignedStoreIds[0] ?? null;

  const user = await prisma.user.create({
    data: {
      name,
      email,
      staffLoginId: loginId,
      passwordHash,
      role: roleIn,
      accessAllStores: effectiveAll,
      editAllStores: effectiveEditAll,
      storeId: primaryStoreId,
      assignedStores:
        assignedStoreIds.length > 0
          ? {
              create: assignedStoreIds.map((storeId) => ({
                storeId,
                canEdit: effectiveEditAll ? true : editStoreIds.includes(storeId),
              })),
            }
          : undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      loginId,
      role: user.role,
      accessAllStores: user.accessAllStores,
      editAllStores: user.editAllStores,
    },
    password,
  });
}
