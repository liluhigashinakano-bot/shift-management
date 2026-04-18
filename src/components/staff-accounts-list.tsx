"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";

type Store = { id: string; name: string };

const ALL = "__all__";

type StaffRow = {
  id: string;
  name: string;
  role: string;
  loginId: string | null;
  email: string;
  accessAllStores: boolean;
  storeId: string | null;
  assignedStoreIds: string[];
};

type RoleChoice = "admin" | "employee" | "viewer";

function roleLabel(r: string): string {
  if (r === "admin") return "管理者";
  if (r === "employee") return "従業員";
  if (r === "viewer") return "閲覧者";
  return r;
}

function storesSummary(u: StaffRow, storeMap: Map<string, string>): string {
  if (u.accessAllStores) return "全店舗";
  const ids =
    u.assignedStoreIds.length > 0
      ? u.assignedStoreIds
      : u.storeId
        ? [u.storeId]
        : [];
  if (ids.length === 0) return "—";
  return ids.map((id) => storeMap.get(id) ?? id).join("、");
}

export function StaffAccountsList({
  stores,
  refreshKey,
  currentUserId,
}: {
  stores: Store[];
  refreshKey: number;
  currentUserId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleChoice>("employee");
  const [loginId, setLoginId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pwModal, setPwModal] = useState<{ password: string } | null>(null);

  const storeMap = useMemo(
    () => new Map(stores.map((s) => [s.id, s.name])),
    [stores],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff-accounts", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        setError("一覧の取得に失敗しました");
        setRows([]);
        return;
      }
      setRows((await res.json()) as StaffRow[]);
    } catch {
      setError("一覧の取得に失敗しました");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const openEdit = (u: StaffRow) => {
    setEditing(u);
    setName(u.name);
    setRole(u.role as RoleChoice);
    const lid = u.loginId ?? "";
    setLoginId(lid);
    if (u.accessAllStores) {
      setSelected(new Set([ALL]));
    } else if (u.assignedStoreIds.length > 0) {
      setSelected(new Set(u.assignedStoreIds));
    } else if (u.storeId) {
      setSelected(new Set([u.storeId]));
    } else {
      setSelected(new Set());
    }
  };

  const closeEdit = () => {
    setEditing(null);
    setSaving(false);
  };

  const allSelected = useMemo(() => selected.has(ALL), [selected]);

  const setAllStores = (on: boolean) => {
    if (on) setSelected(new Set([ALL]));
    else setSelected(new Set());
  };

  const toggleStore = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const trimmedName = name.trim();
    const idNorm = loginId.trim().toLowerCase();
    if (!trimmedName || !idNorm) return;

    if (role !== "admin") {
      if (!allSelected && selected.size === 0) {
        alert("所属店舗を1つ以上選ぶか、「全店舗」を選択してください。");
        return;
      }
    }

    const storeIds = allSelected
      ? []
      : Array.from(selected).filter((x) => x !== ALL);
    const accessAllStores = role === "admin" ? true : allSelected;

    setSaving(true);
    try {
      const res = await fetch(`/api/staff-accounts/${editing.id}`, {
        method: "PATCH",
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
      let payload: { error?: string } = {};
      try {
        payload = JSON.parse(raw) as typeof payload;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        alert(payload.error ?? `更新に失敗しました（HTTP ${res.status}）`);
        return;
      }
      closeEdit();
      await load();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!editing) return;
    if (editing.id === currentUserId) return;
    if (
      !confirm(
        `「${editing.name}」のアカウントを削除しますか？\nこの操作は取り消せません。`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/staff-accounts/${editing.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const raw = await res.text();
      let payload: { error?: string } = {};
      try {
        payload = JSON.parse(raw) as typeof payload;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        alert(payload.error ?? `削除に失敗しました（HTTP ${res.status}）`);
        return;
      }
      closeEdit();
      await load();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!editing) return;
    if (!confirm(`${editing.name} のパスワードを再発行しますか？`)) return;
    const res = await fetch(`/api/staff-accounts/${editing.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "resetPassword" }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      alert(j.error ?? "再発行に失敗しました");
      return;
    }
    const j = (await res.json()) as { password?: string };
    if (j.password) setPwModal({ password: j.password });
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">登録済みアカウント</h2>
      {loading && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b px-3 py-2 font-medium">名前</th>
                <th className="border-b px-3 py-2 font-medium">権限</th>
                <th className="border-b px-3 py-2 font-medium">ログインID</th>
                <th className="border-b px-3 py-2 font-medium">所属店舗</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    まだアカウントがありません
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer hover:bg-purple-50/60 border-b border-gray-100 last:border-0"
                    onClick={() => openEdit(u)}
                  >
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2">{roleLabel(u.role)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.loginId ?? "（未設定）"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {storesSummary(u, storeMap)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">行をクリックすると編集できます。</p>

      {editing && (
        <Modal open title={`編集: ${editing.name}`} onClose={closeEdit}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1">
              <Label htmlFor="edit-name">名前</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">権限</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="edit-role"
                  checked={role === "admin"}
                  onChange={() => setRole("admin")}
                />
                <span className="font-medium">管理者</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="edit-role"
                  checked={role === "employee"}
                  onChange={() => setRole("employee")}
                />
                <span className="font-medium">従業員</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="edit-role"
                  checked={role === "viewer"}
                  onChange={() => setRole("viewer")}
                />
                <span className="font-medium">閲覧者</span>
              </label>
            </fieldset>

            {role !== "admin" && (
              <div className="space-y-2">
                <Label>所属店舗</Label>
                <label className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setAllStores(e.target.checked)}
                  />
                  全店舗
                </label>
                {!allSelected && (
                  <div className="grid gap-2 sm:grid-cols-2 border rounded-md p-3 max-h-48 overflow-y-auto">
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
              <p className="text-xs text-muted-foreground">管理者は全店舗です。</p>
            )}

            <div className="space-y-1">
              <Label htmlFor="edit-login">ログインID</Label>
              <Input
                id="edit-login"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value.replace(/\s/g, ""))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => void resetPassword()}
              >
                パスワードを再発行
              </Button>
              {editing.id !== currentUserId && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => void deleteAccount()}
                >
                  アカウントを削除
                </Button>
              )}
            </div>
            {editing.id === currentUserId && (
              <p className="text-xs text-muted-foreground">
                ログイン中の自分は削除できません。
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeEdit}>
                キャンセル
              </Button>
              <Button
                type="button"
                className="bg-gradient-to-r from-pink-500 to-purple-500 text-white"
                disabled={
                  saving ||
                  !name.trim() ||
                  !loginId.trim() ||
                  (role !== "admin" && !allSelected && selected.size === 0)
                }
                onClick={() => void saveEdit()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pwModal && (
        <Modal open title="新しいパスワード" onClose={() => setPwModal(null)}>
          <p className="text-sm font-mono font-bold break-all mb-3">{pwModal.password}</p>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-3">
            再表示できません。控えてから閉じてください。
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(pwModal.password)
              }
            >
              コピー
            </Button>
            <Button type="button" onClick={() => setPwModal(null)}>
              閉じる
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
