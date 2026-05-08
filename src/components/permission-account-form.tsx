"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";

type Store = { id: string; name: string };

const ALL_STORES_VALUE = "__all__";

type RoleChoice = "admin" | "employee" | "viewer";

export function PermissionAccountForm({
  stores,
  onCreated,
}: {
  stores: Store[];
  onCreated?: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleChoice>("employee");
  const [loginId, setLoginId] = useState("");
  const [viewSelected, setViewSelected] = useState<Set<string>>(new Set());
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [resultModal, setResultModal] = useState<{
    loginId: string;
    password: string;
    label: string;
  } | null>(null);

  const toggleViewStore = (id: string) => {
    setViewSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setEditSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleEditStore = (id: string) => {
    if (role === "viewer") return;
    setEditSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setViewSelected((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const viewAllSelected = useMemo(() => viewSelected.has(ALL_STORES_VALUE), [viewSelected]);
  const editAllSelected = useMemo(() => editSelected.has(ALL_STORES_VALUE), [editSelected]);

  const setViewAllStores = (on: boolean) => {
    if (on) {
      setViewSelected(new Set([ALL_STORES_VALUE]));
    } else {
      setViewSelected(new Set());
      setEditSelected((prev) => {
        const next = new Set(prev);
        next.delete(ALL_STORES_VALUE);
        return next;
      });
    }
  };

  const setEditAllStores = (on: boolean) => {
    if (role === "viewer") return;
    if (on) {
      setEditSelected(new Set([ALL_STORES_VALUE]));
      setViewSelected(new Set([ALL_STORES_VALUE]));
    } else {
      setEditSelected(new Set());
    }
  };

  const submit = async () => {
    const trimmedName = name.trim();
    const idNorm = loginId.trim().toLowerCase();
    if (!trimmedName || !idNorm) return;

    if (role !== "admin") {
      if (viewAllSelected || editAllSelected) {
        /* ok */
      } else if (viewSelected.size === 0 && editSelected.size === 0) {
        alert("閲覧または編集できる店舗を1つ以上選んでください。");
        return;
      }
    }

    const viewStoreIds = viewAllSelected
      ? []
      : Array.from(viewSelected).filter((x) => x !== ALL_STORES_VALUE);
    const editStoreIds = editAllSelected
      ? []
      : Array.from(editSelected).filter((x) => x !== ALL_STORES_VALUE);
    const accessAllStores = role === "admin" ? true : viewAllSelected || editAllSelected;
    const editAllStores = role === "admin" ? true : role === "employee" && editAllSelected;

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
          editAllStores,
          viewStoreIds,
          editStoreIds,
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
        setViewSelected(new Set());
        setEditSelected(new Set());
        setRole("employee");
        onCreated?.();
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
            onChange={() => {
              setRole("viewer");
              setEditSelected(new Set());
            }}
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
          <div className="space-y-2 rounded-md border bg-gray-50/80 p-3">
            <div className="grid grid-cols-[1fr_64px_64px] items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>店舗</span>
              <span className="text-center">編集</span>
              <span className="text-center">閲覧</span>
            </div>
            <div className="grid grid-cols-[1fr_64px_64px] items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium">
              <span>全店舗</span>
              <input
                type="checkbox"
                className="mx-auto"
                checked={editAllSelected}
                disabled={role === "viewer"}
                onChange={(e) => setEditAllStores(e.target.checked)}
              />
              <input
                type="checkbox"
                className="mx-auto"
                checked={viewAllSelected}
                onChange={(e) => setViewAllStores(e.target.checked)}
              />
            </div>
            {!editAllSelected && (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {stores.map((s) => (
                  <div
                    key={s.id}
                    className="grid grid-cols-[1fr_64px_64px] items-center gap-2 rounded-md bg-white px-3 py-2 text-sm"
                  >
                    <span>{s.name}</span>
                    <input
                      type="checkbox"
                      className="mx-auto"
                      checked={editSelected.has(s.id)}
                      disabled={role === "viewer"}
                      onChange={() => toggleEditStore(s.id)}
                    />
                    <input
                      type="checkbox"
                      className="mx-auto"
                      checked={viewAllSelected || viewSelected.has(s.id)}
                      disabled={viewAllSelected}
                      onChange={() => toggleViewStore(s.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            編集にチェックした店舗は閲覧も可能です。閲覧だけの店舗ではシフト表などを変更できません。
          </p>
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
          (role !== "admin" &&
            !viewAllSelected &&
            !editAllSelected &&
            viewSelected.size === 0 &&
            editSelected.size === 0)
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
