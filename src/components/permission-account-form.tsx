"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";

type Store = { id: string; name: string };

const ALL_STORES_VALUE = "__all__";

type RoleChoice = "admin" | "employee" | "viewer";

export function PermissionAccountForm({ stores }: { stores: Store[] }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleChoice>("employee");
  const [loginId, setLoginId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [resultModal, setResultModal] = useState<{
    loginId: string;
    password: string;
    label: string;
  } | null>(null);

  const toggleStore = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = useMemo(() => selected.has(ALL_STORES_VALUE), [selected]);

  const setAllStores = (on: boolean) => {
    if (on) {
      setSelected(new Set([ALL_STORES_VALUE]));
    } else {
      setSelected(new Set());
    }
  };

  const submit = async () => {
    const trimmedName = name.trim();
    const idNorm = loginId.trim().toLowerCase();
    if (!trimmedName || !idNorm) return;

    if (role !== "admin") {
      if (allSelected) {
        /* ok */
      } else if (selected.size === 0) {
        alert("所属店舗を1つ以上選ぶか、「全店舗」を選択してください。");
        return;
      }
    }

    const storeIds = allSelected
      ? []
      : Array.from(selected).filter((x) => x !== ALL_STORES_VALUE);
    const accessAllStores = role === "admin" ? true : allSelected;

    setSaving(true);
    try {
      const res = await fetch("/api/staff-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: trimmedName,
          role,
          loginId: idNorm,
          accessAllStores,
          storeIds,
        }),
      });
      const raw = await res.text();
      let payload: { password?: string; error?: string } = {};
      try {
        payload = JSON.parse(raw) as typeof payload;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        alert(payload.error ?? `作成に失敗しました（HTTP ${res.status}）`);
        return;
      }
      if (payload.password) {
        setResultModal({
          loginId: idNorm,
          password: payload.password,
          label: trimmedName,
        });
        setName("");
        setLoginId("");
        setSelected(new Set());
        setRole("employee");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-1">
        <Label htmlFor="pa-name">名前</Label>
        <Input
          id="pa-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="表示名"
          autoComplete="name"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">権限</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="role"
            checked={role === "admin"}
            onChange={() => setRole("admin")}
          />
          <span>
            <span className="font-medium">管理者</span>
            <span className="text-muted-foreground"> — すべての権限（権限設定を含む）</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="role"
            checked={role === "employee"}
            onChange={() => setRole("employee")}
          />
          <span>
            <span className="font-medium">従業員</span>
            <span className="text-muted-foreground">
              {" "}
              — 権限設定以外の操作が可能
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="role"
            checked={role === "viewer"}
            onChange={() => setRole("viewer")}
          />
          <span>
            <span className="font-medium">閲覧者</span>
            <span className="text-muted-foreground">
              {" "}
              — 権限設定以外の画面は閲覧のみ
            </span>
          </span>
        </label>
      </fieldset>

      {role !== "admin" && (
        <div className="space-y-2">
          <Label>所属店舗（複数可）</Label>
          <label className="flex items-center gap-2 text-sm font-medium border rounded-md px-3 py-2 bg-white">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => setAllStores(e.target.checked)}
            />
            全店舗
          </label>
          {!allSelected && (
            <div className="grid gap-2 sm:grid-cols-2 border rounded-md p-3 bg-gray-50/80 max-h-56 overflow-y-auto">
              {stores.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleStore(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {role === "admin" && (
        <p className="text-xs text-muted-foreground">
          管理者は全店舗で利用できます（店舗の個別指定はありません）。
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="pa-login">ログインID</Label>
        <Input
          id="pa-login"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value.replace(/\s/g, ""))}
          placeholder="英数字など（ログイン時に使用）"
          autoComplete="username"
        />
        <p className="text-xs text-muted-foreground">
          メールアドレス形式である必要はありません。@ は使えません。
        </p>
      </div>

      <div className="space-y-1">
        <Label>パスワード</Label>
        <p className="text-sm text-muted-foreground">
          作成時に自動生成されます。完了画面で一度だけ表示します。
        </p>
      </div>

      <Button
        type="button"
        className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
        disabled={
          saving ||
          !name.trim() ||
          !loginId.trim() ||
          (role !== "admin" && !allSelected && selected.size === 0)
        }
        onClick={() => void submit()}
      >
        {saving ? "作成中…" : "アカウントを作成"}
      </Button>

      {resultModal && (
        <Modal
          open
          title="アカウントを作成しました"
          onClose={() => setResultModal(null)}
        >
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">名前: </span>
              {resultModal.label}
            </p>
            <p>
              <span className="text-muted-foreground">ログインID: </span>
              <span className="font-mono font-medium">{resultModal.loginId}</span>
            </p>
            <p>
              <span className="text-muted-foreground">パスワード: </span>
              <span className="font-mono font-bold break-all">{resultModal.password}</span>
            </p>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              このパスワードは再表示できません。必ず控えてください。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `ID: ${resultModal.loginId}\nパスワード: ${resultModal.password}`,
                  );
                }}
              >
                コピー
              </Button>
              <Button type="button" onClick={() => setResultModal(null)}>
                閉じる
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
