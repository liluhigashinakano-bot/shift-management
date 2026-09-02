import { prisma } from "@/lib/db";
import { isStaffAccountRole, type StaffAccountRole } from "@/lib/roles";

export type StaffAccountInput = {
  name: string;
  role: StaffAccountRole;
  loginId: string;
  email: string;
  accessAllStores: boolean;
  editAllStores: boolean;
  /** 閲覧できる店舗（編集する店舗も含む） */
  assignedStoreIds: string[];
  /** そのうち編集もできる店舗 */
  editStoreIds: string[];
  primaryStoreId: string | null;
};

export type StaffAccountParse =
  | { ok: true; value: StaffAccountInput }
  | { ok: false; error: string; status: number };

function toStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((x) => String(x).trim()).filter(Boolean) : [];
}

/**
 * 権限設定の入力を確かめて、保存する形にそろえる。
 * 新規作成と編集で同じ決まりを使う（片方だけ直して食い違うのを防ぐ）。
 */
export async function parseStaffAccountBody(
  body: Record<string, unknown>,
): Promise<StaffAccountParse> {
  const name = String(body.name ?? "").trim();
  const roleIn = String(body.role ?? "").trim();
  const loginId = String(body.loginId ?? "").trim().toLowerCase();

  if (!name || !loginId) {
    return { ok: false, error: "名前とIDは必須です", status: 400 };
  }
  if (!isStaffAccountRole(roleIn)) {
    return { ok: false, error: "権限の指定が不正です", status: 400 };
  }
  if (loginId.includes("@") || /\s/.test(loginId)) {
    return { ok: false, error: "ID に @ や空白は使えません", status: 400 };
  }

  const viewStoreIds = toStringArray(body.viewStoreIds ?? body.storeIds);
  const editStoreIdsRaw = toStringArray(body.editStoreIds ?? body.storeIds);
  const requestedStoreIds = [...new Set([...viewStoreIds, ...editStoreIdsRaw])];

  if (requestedStoreIds.length > 0) {
    const rows = await prisma.store.findMany({
      where: { id: { in: requestedStoreIds } },
      select: { id: true },
    });
    if (rows.length !== requestedStoreIds.length) {
      return { ok: false, error: "無効な店舗IDが含まれています", status: 400 };
    }
  }

  const isAdmin = roleIn === "admin";
  // 閲覧者は店舗を絞らない（store-access.ts も閲覧者は全店舗として扱う）。
  // 画面で店舗を選ばせて効かない、という食い違いを作らないため、ここでそろえる。
  const isViewer = roleIn === "viewer";

  if (isAdmin || isViewer) {
    return {
      ok: true,
      value: {
        name,
        role: roleIn,
        loginId,
        email: `${loginId}@staff.local`,
        accessAllStores: true,
        editAllStores: isAdmin,
        assignedStoreIds: [],
        editStoreIds: [],
        primaryStoreId: null,
      },
    };
  }

  // ここから従業員
  const editAllStores = Boolean(body.editAllStores);
  const accessAllStores = Boolean(body.accessAllStores) || editAllStores;
  const assignedStoreIds = accessAllStores
    ? [...new Set(editStoreIdsRaw)]
    : requestedStoreIds;

  if (!accessAllStores && assignedStoreIds.length === 0) {
    return {
      ok: false,
      error: "所属店舗を1つ以上選ぶか、「全店舗」を指定してください",
      status: 400,
    };
  }

  return {
    ok: true,
    value: {
      name,
      role: roleIn,
      loginId,
      email: `${loginId}@staff.local`,
      accessAllStores,
      editAllStores,
      assignedStoreIds,
      editStoreIds: editAllStores ? assignedStoreIds : editStoreIdsRaw,
      primaryStoreId:
        accessAllStores || assignedStoreIds.length === 0
          ? null
          : assignedStoreIds[0] ?? null,
    },
  };
}

/** UserStoreAssignment に入れる行 */
export function assignmentRows(input: StaffAccountInput) {
  return input.assignedStoreIds.map((storeId) => ({
    storeId,
    canEdit: input.editAllStores ? true : input.editStoreIds.includes(storeId),
  }));
}
