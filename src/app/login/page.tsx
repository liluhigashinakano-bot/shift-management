"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    if (res?.error) {
      setError("メールアドレスまたはパスワードが正しくありません");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-200 via-purple-100 to-sky-200">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-sky-500 bg-clip-text text-transparent">
            シフト管理システム
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            ガールズバー 7店舗シフト管理
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="admin@shift.local"
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
            <p>テストアカウント:</p>
            <p>管理者: admin@shift.local / admin123</p>
            <p>社員: 吉田@shift.local / staff123</p>
            <p>キャスト: りりむ@cast.local / cast123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
