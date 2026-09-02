import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "./db";
import { findUserIdForLogin } from "./auth-lookup-user";
import { normalizeLoginCredential } from "./login-email";
import {
  canAttemptLogin,
  recordLoginFailure,
  recordLoginSuccess,
} from "./login-attempts";
import type { UserRole } from "./roles";
import type { JWT } from "next-auth/jwt";

/**
 * パスワードの指紋。
 * bcrypt のハッシュは毎回変わるので、再発行すればこの値も変わる。
 * ログインの中に控えておき、変わっていたら他の端末のログインを無効にする。
 */
function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

/**
 * ログイン後も DB の変更（権限・店舗・名前など）をセッションに反映する。
 *
 * 戻り値 false は「このログインを無効にする」。
 *  - 利用者が削除された
 *  - パスワードが再発行された（他の端末に残っているログインを追い出す）
 * DB に届かなかったときは true（通信の失敗で全員を締め出さない）。
 */
async function refreshJwtUserFieldsFromDb(token: JWT): Promise<boolean> {
  const id = token.sub;
  if (!id || typeof id !== "string") return true;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id },
      select: {
        name: true,
        email: true,
        role: true,
        storeId: true,
        passwordHash: true,
        accessAllStores: true,
        editAllStores: true,
        assignedStores: { select: { storeId: true, canEdit: true } },
        store: { select: { name: true } },
      },
    });
    // 削除されたキャスト・従業員が 30 日間ログインしたままにならないようにする
    if (!dbUser) return false;

    const fingerprint = passwordFingerprint(dbUser.passwordHash);
    if (token.pwf && token.pwf !== fingerprint) return false;
    token.pwf = fingerprint;

    token.name = dbUser.name;
    token.email = dbUser.email;
    token.role = dbUser.role as UserRole;
    token.storeId = dbUser.storeId;
    token.storeName = dbUser.store?.name ?? null;
    token.accessAllStores = dbUser.accessAllStores;
    token.editAllStores = dbUser.editAllStores;
    token.assignedStoreIds = dbUser.assignedStores.map((a) => a.storeId);
    token.editableStoreIds = dbUser.assignedStores
      .filter((a) => a.canEdit)
      .map((a) => a.storeId);
    return true;
  } catch (e) {
    console.error("[auth][refreshJwtUserFieldsFromDb]", e);
    return true;
  }
}

// Auth.js は JWT 暗号化に secret が必須。.env が読み込まれないケースでも開発を止めないためのフォールバック
function resolveAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV !== "production") {
    return "shift-management-dev-secret-not-for-production";
  }
  // next build では NODE_ENV=production だが Variables はまだ無いことがある（Docker/Railway）
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return "build-time-auth-secret-placeholder-not-used-at-runtime";
  }
  // 本番ランタイムで未設定のときはサーバー起動を止めない（ヘルスチェック失敗のループを避ける）
  // 必ず Railway の Variables に AUTH_SECRET（と NEXTAUTH_SECRET）を設定すること
  console.error(
    "[auth] AUTH_SECRET / NEXTAUTH_SECRET が未設定です。Railway の Variables に設定してください。",
  );
  return "runtime-missing-auth-secret-please-set-railway-variables";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: resolveAuthSecret(),
  debug: process.env.NODE_ENV !== "production",
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "メールまたはキャストID", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const password = String(credentials.password).trim();
        const rawLogin = String(credentials.email ?? "");
        const loginKey = normalizeLoginCredential(rawLogin);
        if (!loginKey) return null;

        // 総当たり対策。続けて間違えたら少し待たせる
        if (!canAttemptLogin(loginKey)) {
          console.warn("[auth] 失敗が続いたため一時的に受け付けません");
          return null;
        }

        try {
          const userId = await findUserIdForLogin(rawLogin);
          const user = userId
            ? await prisma.user.findUnique({
                where: { id: userId },
                include: {
                  store: true,
                  assignedStores: { select: { storeId: true, canEdit: true } },
                },
              })
            : null;

          if (!user) {
            recordLoginFailure(loginKey);
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auth] credentials: ユーザーが見つかりません:", rawLogin);
            }
            return null;
          }
          if (!compareSync(password, user.passwordHash)) {
            recordLoginFailure(loginKey);
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auth] credentials: パスワード不一致:", rawLogin);
            }
            return null;
          }

          recordLoginSuccess(loginKey);
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role as UserRole,
            storeId: user.storeId,
            storeName: user.store?.name ?? null,
            accessAllStores: user.accessAllStores,
            editAllStores: user.editAllStores,
            assignedStoreIds: user.assignedStores.map((a) => a.storeId),
            editableStoreIds: user.assignedStores
              .filter((a) => a.canEdit)
              .map((a) => a.storeId),
          };
        } catch (e) {
          console.error("[auth][authorize]", e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name ?? null;
        token.email = user.email ?? null;
        token.role = user.role;
        token.storeId = user.storeId ?? null;
        token.storeName = user.storeName ?? null;
        token.accessAllStores = user.accessAllStores;
        token.editAllStores = user.editAllStores;
        token.assignedStoreIds = user.assignedStoreIds;
        token.editableStoreIds = user.editableStoreIds;
        // 指紋はここでは付けない。次の読み込みで DB から入る
        return token;
      }
      const stillValid = await refreshJwtUserFieldsFromDb(token);
      if (!stillValid) return null;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
        session.user.role = token.role ?? "cast";
        session.user.storeId = token.storeId ?? null;
        session.user.storeName = token.storeName ?? null;
        session.user.accessAllStores = token.accessAllStores;
        session.user.editAllStores = token.editAllStores;
        session.user.assignedStoreIds = Array.isArray(token.assignedStoreIds)
          ? token.assignedStoreIds
          : [];
        session.user.editableStoreIds = Array.isArray(token.editableStoreIds)
          ? token.editableStoreIds
          : [];
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
