import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { prisma } from "./db";
import { findUserIdForLogin } from "./auth-lookup-user";

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
                  assignedStores: { select: { storeId: true } },
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
            storeName: user.store?.name,
            accessAllStores: user.accessAllStores,
            assignedStoreIds: user.assignedStores.map((a) => a.storeId),
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
        token.role = (user as any).role;
        token.storeId = (user as any).storeId;
        token.storeName = (user as any).storeName;
        token.accessAllStores = (user as any).accessAllStores;
        token.assignedStoreIds = (user as any).assignedStoreIds;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? "";
        (session.user as any).role = token.role;
        (session.user as any).storeId = token.storeId;
        (session.user as any).storeName = token.storeName;
        (session.user as any).accessAllStores = token.accessAllStores;
        (session.user as any).assignedStoreIds = token.assignedStoreIds;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
