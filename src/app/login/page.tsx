"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeLoginCredential } from "@/lib/login-email";

/** 失敗の理由は 1 種類にまとめる（内部の事情はキャストに見せない） */
const LOGIN_FAILED_MESSAGE =
  "キャストIDまたはパスワードが正しくありません。何度か続けて間違えると、しばらく試せなくなります。";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const emailRaw = formData.get("email");
    const passwordRaw = formData.get("password");
    const email = normalizeLoginCredential(
      typeof emailRaw === "string" ? emailRaw : String(emailRaw ?? ""),
    );
    const password = typeof passwordRaw === "string" ? passwordRaw.trim() : String(passwordRaw ?? "").trim();

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!res) {
      setError("つながりませんでした。電波と接続を確かめて、もう一度お試しください。");
      setLoading(false);
      return;
    }

    if (!res.ok) {
      setError(LOGIN_FAILED_MESSAGE);
      setLoading(false);
      return;
    }

    // redirect:false の場合、失敗でも res.error が空のことがあるので URL も見る
    if (res.error) {
      setError(LOGIN_FAILED_MESSAGE);
      setLoading(false);
      return;
    }

    if (res.url) {
      try {
        const u = new URL(res.url);
        const err = u.searchParams.get("error");
        if (err) {
          setError(LOGIN_FAILED_MESSAGE);
          setLoading(false);
          return;
        }
      } catch {
        // ignore
      }
    }

    // セッション Cookie がブラウザに反映されるまで待ってから遷移（サーバー側 auth() が null になるのを防ぐ）
    const session = await getSession();
    if (!session) {
      setError(
        "ログインの確認ができませんでした。ページを再読み込みして、もう一度お試しください。",
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-pink-200 via-purple-100 to-sky-200">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 bg-clip-text text-transparent">
            シフト管理システム
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">シフトの提出と確認</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">キャストID</Label>
              <Input
                id="email"
                name="email"
                type="text"
                required
                autoComplete="username"
                placeholder="キャストID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                placeholder="パスワード"
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 hover:from-pink-600 hover:via-purple-600 hover:to-sky-600 text-white"
              disabled={loading}
            >
              {loading ? "ログイン中..." : "ログイン"}
            </Button>
          </form>
          <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-500 space-y-1">
            <p>登録したキャストIDとパスワードでログインしてください。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
