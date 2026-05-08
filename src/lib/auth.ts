import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { prisma } from "./db";
import { findUserIdForLogin } from "./auth-lookup-user";
import type { JWT } from "next-auth/jwt";

/** ログイン後も DB の変更（権限・店舗・名前など）をセッションに反映する */
async function refreshJwtUserFieldsFromDb(token: JWT) {
  const id = token.sub;
  if (!id || typeof id !== "string") return;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id },
      select: {
        name: true,
        email: true,
        role: true,
        storeId: true,
        accessAllStores: true,
        editAllStores: true,
        assignedStores: { select: { storeId: true, canEdit: true } },
        store: { select: { name: true } },
      },
    });
    if (!dbUser) return;

    token.name = dbUser.name;
    token.email = dbUser.email;
    token.role = dbUser.role;
    token.storeId = dbUser.storeId;
    token.storeName = dbUser.store?.name ?? null;
    token.accessAllStores = dbUser.accessAllStores;
    token.editAllStores = dbUser.editAllStores;
    token.assignedStoreIds = dbUser.assignedStores.map((a) => a.storeId);
    token.editableStoreIds = dbUser.assignedStores
      .filter((a) => a.canEdit)
      .map((a) => a.storeId);
  } catch (e) {
    console.error("[auth][refreshJwtUserFieldsFromDb]", e);
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

        try {
          const rawLogin = String(credentials.email ?? "");
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
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auth] credentials: ユーザーが見つかりません:", rawLogin);
            }
            return null;
          }
          if (!compareSync(password, user.passwordHash)) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auth] credentials: パスワード不一致:", rawLogin);
            }
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
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
        token.name = (user as any).name;
        token.email = (user as any).email;
        token.role = (user as any).role;
        token.storeId = (user as any).storeId;
        token.storeName = (user as any).storeName;
        token.accessAllStores = (user as any).accessAllStores;
        token.editAllStores = (user as any).editAllStores;
        token.assignedStoreIds = (user as any).assignedStoreIds;
        token.editableStoreIds = (user as any).editableStoreIds;
        return token;
      }
      await refreshJwtUserFieldsFromDb(token);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? "";
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
        (session.user as any).role = token.role;
        (session.user as any).storeId = token.storeId ?? null;
        (session.user as any).storeName = token.storeName ?? null;
        (session.user as any).accessAllStores = token.accessAllStores;
        (session.user as any).editAllStores = token.editAllStores;
        (session.user as any).assignedStoreIds = Array.isArray(token.assignedStoreIds)
          ? token.assignedStoreIds
          : [];
        (session.user as any).editableStoreIds = Array.isArray(token.editableStoreIds)
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
