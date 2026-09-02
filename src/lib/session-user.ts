import type { Session } from "next-auth";

/**
 * ログイン中の利用者。next-auth.d.ts で拡張済みの型をそのまま使う。
 * 各画面・受け口で `as any` を書かなくて済むように、ここから型を配る。
 */
export type SessionUser = Session["user"];
export type UserRole = SessionUser["role"];

/** session が null のこともあるので、権限だけ安全に取り出す */
export function getRole(session: Session | null): UserRole | undefined {
  return session?.user?.role;
}

/** 管理者・従業員（シフト表を編集しうる側） */
export function isStaffRole(role: UserRole | undefined): boolean {
  return role === "admin" || role === "employee";
}
