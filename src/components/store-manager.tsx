"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import { postJson } from "@/lib/api-request";

type Store = { id: string; name: string; castCount: number };

export function StoreManager({
  initialStores,
  readOnly = false,
}: {
  initialStores: Store[];
  readOnly?: boolean;
}) {
  const [stores, setStores] = useState(initialStores);
  const [addModal, setAddModal] = useState(false);
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const res = await fetch("/api/stores");
    if (res.ok) setStores(await res.json());
  };

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const result = await postJson(
        "/api/stores",
        { action: "create", name: trimmed },
        { fallbackMessage: "店舗を追加できませんでした" },
      );
      // 失敗したら窓を閉じない（閉じると成功したように見える）
      if (!result.ok) return;
      setAddModal(false);
      setName("");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    const trimmed = name.trim();
    if (!editStore || !trimmed || saving) return;
    setSaving(true);
    try {
      const result = await postJson(
        "/api/stores",
        { action: "update", id: editStore.id, name: trimmed },
        { fallbackMessage: "店舗名を変更できませんでした" },
      );
      if (!result.ok) return;
      setEditStore(null);
      setName("");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {readOnly && (
        <p className="text-sm text-muted-foreground">閲覧のみ（店舗の追加・編集は管理者が行います）</p>
      )}
      {!readOnly && (
      <Button
        className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
        onClick={() => {
          setName("");
          setAddModal(true);
        }}
      >
        + 店舗追加
      </Button>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2 text-left">店舗名</th>
            <th className="border border-gray-300 px-4 py-2 text-center">キャスト数</th>
            {!readOnly && (
            <th className="border border-gray-300 px-4 py-2 text-center w-24">操作</th>
            )}
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="border border-gray-300 px-4 py-2 font-medium">{s.name}</td>
              <td className="border border-gray-300 px-4 py-2 text-center">{s.castCount}名</td>
              {!readOnly && (
              <td className="border border-gray-300 px-4 py-2 text-center">
                <button
                  className="text-xs text-blue-600 hover:text-blue-800"
                  onClick={() => {
                    setName(s.name);
                    setEditStore(s);
                  }}
                >
                  編集
                </button>
              </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {addModal && (
        <Modal open title="店舗追加" onClose={() => setAddModal(false)}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>店舗名</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="新しい店舗名" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setAddModal(false)}>キャンセル</Button>
            <Button onClick={handleAdd} disabled={saving || !name.trim()} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
              {saving ? "保存中..." : "追加"}
            </Button>
          </div>
        </Modal>
      )}

      {editStore && (
        <Modal open title={`${editStore.name} を編集`} onClose={() => setEditStore(null)}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>店舗名</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setEditStore(null)}>キャンセル</Button>
            <Button onClick={handleUpdate} disabled={saving || !name.trim()} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
              {saving ? "保存中..." : "更新"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
