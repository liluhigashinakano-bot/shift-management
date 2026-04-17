"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import { generateStrongPassword } from "@/lib/generate-strong-password";

type Cast = {
  id: string;
  name: string;
  email: string;
  castLoginId: string | null;
  storeId: string | null;
  store: { id: string; name: string } | null;
};
type Store = { id: string; name: string };

type Props = {
  initialCasts: Cast[];
  stores: Store[];
};

function displayCastId(c: Cast): string {
  return (c.castLoginId && c.castLoginId.length > 0
    ? c.castLoginId
    : c.email.split("@")[0]) || "—";
}

export function CastManager({ initialCasts, stores }: Props) {
  const [casts, setCasts] = useState(initialCasts);
  const [editModal, setEditModal] = useState<Cast | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [selectedStore, setSelectedStore] = useState(stores[0]?.id || "");
  const [passwordModal, setPasswordModal] = useState<{
    castLoginId: string;
    password: string;
    title: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [castLoginId, setCastLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const res = await fetch("/api/casts", { credentials: "same-origin" });
    if (res.ok) setCasts(await res.json());
  };

  const openAdd = () => {
    setName("");
    setCastLoginId("");
    setPassword(generateStrongPassword());
    setStoreId(selectedStore);
    setAddModal(true);
  };

  const openEdit = (cast: Cast) => {
    setName(cast.name);
    setCastLoginId(displayCastId(cast));
    setStoreId(cast.storeId || "");
    setEditModal(cast);
  };

  const handleAdd = async () => {
    if (!name.trim() || !castLoginId.trim() || !storeId || !password) return;
    setSaving(true);
    const loginIdCopy = castLoginId.trim();
    const passwordCopy = password;
    try {
      const res = await fetch("/api/casts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          castLoginId: loginIdCopy,
          password: passwordCopy,
          storeId,
        }),
      });
      const raw = await res.text();
      let message = `追加に失敗しました（HTTP ${res.status}）`;
      try {
        const json = JSON.parse(raw) as { error?: string; message?: string };
        const detail = json.error || json.message;
        if (detail) message = detail;
      } catch {
        if (raw.trim()) message = raw.slice(0, 300);
      }
      if (!res.ok) {
        alert(message);
        return;
      }
      setAddModal(false);
      setPassword(generateStrongPassword());
      setPasswordModal({
        castLoginId: loginIdCopy,
        password: passwordCopy,
        title: "登録したログイン情報",
      });
      reload();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editModal || !name.trim() || !castLoginId.trim() || !storeId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/casts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "update",
          id: editModal.id,
          name: name.trim(),
          castLoginId: castLoginId.trim(),
          storeId,
        }),
      });
      const raw = await res.text();
      let message = `更新に失敗しました（HTTP ${res.status}）`;
      try {
        const json = JSON.parse(raw) as { error?: string; message?: string };
        const detail = json.error || json.message;
        if (detail) message = detail;
      } catch {
        if (raw.trim()) message = raw.slice(0, 300);
      }
      if (!res.ok) {
        alert(message);
        return;
      }
      setEditModal(null);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "通信に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, castName: string) => {
    if (!confirm(`${castName}を削除しますか？`)) return;
    const res = await fetch("/api/casts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      alert(json.error ?? `削除に失敗しました（HTTP ${res.status}）`);
      return;
    }
    await reload();
  };

  const handleResetPassword = async (cast: Cast) => {
    if (!confirm(`${cast.name} のパスワードを再発行しますか？`)) return;
    const res = await fetch("/api/casts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetPassword", id: cast.id }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.password) {
        setPasswordModal({
          castLoginId: displayCastId(cast),
          password: json.password,
          title: "再発行パスワード",
        });
      }
    }
  };

  const selectedStoreName = stores.find((s) => s.id === selectedStore)?.name || "";
  const storeCasts = casts.filter((c) => c.storeId === selectedStore);

  const addForm = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>キャスト名</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="キャスト名" />
      </div>
      <div className="space-y-1">
        <Label>所属店舗</Label>
        <select
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>キャストID</Label>
        <Input
          value={castLoginId}
          onChange={(e) => setCastLoginId(e.target.value)}
          placeholder="ログイン用ID"
          autoComplete="off"
        />
        <p className="text-xs text-gray-500">ログイン時は「キャストID」とパスワードを使います。</p>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>パスワード</Label>
          <button
            type="button"
            className="text-xs text-purple-600 hover:text-purple-800"
            onClick={() => setPassword(generateStrongPassword())}
          >
            別のパスワードを生成
          </button>
        </div>
        <Input
          type="text"
          className="font-mono text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="自動生成されます"
          autoComplete="new-password"
          spellCheck={false}
        />
        <p className="text-xs text-gray-500">
          英大文字・小文字・数字・記号を含む 20 文字前後を自動生成しています。必要に応じて編集できます。
        </p>
      </div>
    </div>
  );

  const editForm = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>キャスト名</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="キャスト名" />
      </div>
      <div className="space-y-1">
        <Label>所属店舗</Label>
        <select
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>キャストID</Label>
        <Input
          value={castLoginId}
          onChange={(e) => setCastLoginId(e.target.value)}
          placeholder="ログイン用ID"
          autoComplete="off"
        />
        <p className="text-xs text-gray-500">変更するとログインIDも更新されます。</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-300 overflow-x-auto">
        {stores.map((s) => {
          const count = casts.filter((c) => c.storeId === s.id).length;
          return (
            <button
              key={s.id}
              type="button"
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                selectedStore === s.id
                  ? "border-purple-500 text-purple-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setSelectedStore(s.id)}
            >
              {s.name}（{count}）
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button
          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          onClick={openAdd}
        >
          + キャスト追加
        </Button>
        <span className="text-sm text-gray-500">
          {selectedStoreName}：{storeCasts.length}名
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">キャスト名</th>
              <th className="border border-gray-300 px-3 py-2 text-left">キャストID</th>
              <th className="border border-gray-300 px-3 py-2 text-center w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            {storeCasts.length === 0 ? (
              <tr>
                <td colSpan={3} className="border border-gray-300 px-3 py-8 text-center text-gray-400">
                  キャストが登録されていません
                </td>
              </tr>
            ) : (
              storeCasts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-3 py-1.5 font-medium">{c.name}</td>
                  <td className="border border-gray-300 px-3 py-1.5 font-mono text-xs text-gray-700">
                    {displayCastId(c)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:text-blue-800 mr-2"
                      onClick={() => openEdit(c)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="text-xs text-purple-600 hover:text-purple-800 mr-2"
                      onClick={() => handleResetPassword(c)}
                    >
                      PW再発行
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:text-red-600"
                      onClick={() => handleDelete(c.id, c.name)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {addModal && (
        <Modal open title={`${selectedStoreName} - キャスト追加`} onClose={() => setAddModal(false)}>
          {addForm}
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setAddModal(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => void handleAdd()}
              disabled={
                saving || !name.trim() || !castLoginId.trim() || !storeId || !password
              }
              className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
            >
              {saving ? "保存中..." : "追加"}
            </Button>
          </div>
        </Modal>
      )}

      {editModal && (
        <Modal open title={`${editModal.name} を編集`} onClose={() => setEditModal(null)}>
          {editForm}
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setEditModal(null)}>
              キャンセル
            </Button>
            <Button
              onClick={() => void handleUpdate()}
              disabled={saving || !name.trim() || !castLoginId.trim() || !storeId}
              className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
            >
              {saving ? "保存中..." : "更新"}
            </Button>
          </div>
        </Modal>
      )}

      {passwordModal && (
        <Modal open title={passwordModal.title} onClose={() => setPasswordModal(null)}>
          <div className="space-y-3">
            <div className="text-sm text-gray-600">
              キャストID: <span className="font-mono">{passwordModal.castLoginId}</span>
            </div>
            <div className="text-sm text-gray-600">
              パスワード: <span className="font-mono font-bold">{passwordModal.password}</span>
            </div>
            <div className="text-xs text-gray-400">
              この画面を閉じると再表示できません。必要ならコピーしてください。
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${passwordModal.castLoginId}\n${passwordModal.password}`,
                  );
                }}
              >
                コピー
              </Button>
              <Button onClick={() => setPasswordModal(null)}>閉じる</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
