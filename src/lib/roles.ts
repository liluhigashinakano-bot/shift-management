/** 権限の種類。next-auth の型拡張とアプリ側の両方から参照する（循環を避けるため独立） */
export type UserRole = "admin" | "employee" | "viewer" | "cast";

/** 権限設定の画面で作れるアカウント（キャスト以外） */
export const STAFF_ACCOUNT_ROLES = ["admin", "employee", "viewer"] as const;
export type StaffAccountRole = (typeof STAFF_ACCOUNT_ROLES)[number];

export function isStaffAccountRole(value: string): value is StaffAccountRole {
  return (STAFF_ACCOUNT_ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: string): string {
  if (role === "admin") return "管理者";
  if (role === "employee") return "従業員";
  if (role === "viewer") return "閲覧者";
  if (role === "cast") return "キャスト";
  return role;
}
