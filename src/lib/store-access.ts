import { redirect } from "next/navigation";

export type SessionUserLike = {
  role?: string;
  storeId?: string | null;
  accessAllStores?: boolean;
  editAllStores?: boolean;
  assignedStoreIds?: string[];
  editableStoreIds?: string[];
};

/** シフト表などで参照可能な店舗 ID の一覧（管理者は null = 制限なし） */
export function getAccessibleStoreIds(user: SessionUserLike): string[] | null {
  const role = user.role;
  if (role === "admin") return null;
  if (role === "viewer") return null;
  if (role === "cast") return user.storeId ? [user.storeId] : [];
  if (user.accessAllStores) return null;
  const assigned = user.assignedStoreIds?.filter(Boolean) ?? [];
  if (assigned.length > 0) return assigned;
  if (user.storeId) return [user.storeId];
  return [];
}

/** null = すべての店舗へアクセス可 */
export function canAccessStore(user: SessionUserLike, storeId: string): boolean {
  const ids = getAccessibleStoreIds(user);
  if (ids === null) return true;
  return ids.includes(storeId);
}

/** シフト編集など、店舗単位の更新操作が可能な店舗 ID の一覧（管理者は null = 制限なし） */
export function getEditableStoreIds(user: SessionUserLike): string[] | null {
  const role = user.role;
  if (role === "admin") return null;
  if (role !== "employee") return [];
  if (user.editAllStores) return null;
  return user.editableStoreIds?.filter(Boolean) ?? [];
}

/** null = すべての店舗を編集可 */
export function canEditStore(user: SessionUserLike, storeId: string): boolean {
  const ids = getEditableStoreIds(user);
  if (ids === null) return true;
  return ids.includes(storeId);
}

/** 店舗単位ページで、対象店舗を見られなければダッシュボードへ */
export function assertStorePageAccess(
  user: SessionUserLike,
  storeId: string,
): void {
  if (user.role === "cast") {
    redirect("/mypage");
  }
  if (!canAccessStore(user, storeId)) {
    redirect("/dashboard");
  }
}
