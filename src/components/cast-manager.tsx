"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";

type Cast = {
  id: string;
  name: string;
  email: string;
  hourlyRate: number | null;
  posId: string | null;
  storeId: string | null;
  store: { id: string; name: string } | null;
};
type Store = { id: string; name: string };

type Props = {
  initialCasts: Cast[];
  stores: Store[];
};

export function CastManager({ initialCasts, stores }: Props) {
  const [casts, setCasts] = useState(initialCasts);
  const [editModal, setEditModal] = useState<Cast | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [selectedStore, setSelectedStore] = useState(stores[0]?.id || "");

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [storeId, setStoreId] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [posId, setPosId] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const res = await fetch("/api/casts");
    if (res.ok) setCasts(await res.json());
  };

  const openAdd = () => {
    setName("");
    setEmail("");
    setStoreId(selectedStore);
    setHourlyRate("");
    setPosId("");
    setAddModal(true);
  };

  const openEdit = (cast: Cast) => {
    setName(cast.name);
    setEmail(cast.email);
    setStoreId(cast.storeId || "");
    setHourlyRate(cast.hourlyRate?.toString() || "");
    setPosId(cast.posId || "");
    setEditModal(cast);
  };

  const handleAdd = async () => {
    if (!name || !email) return;
    setSaving(true);
    await fetch("/api/casts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name, email, storeId, hourlyRate, posId }),
    });
    setSaving(false);
    setAddModal(false);
    reload();
  };

  const handleUpdate = async () => {
    if (!editModal || !name || !email) return;
    setSaving(true);
    await fetch("/api/casts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: editModal.id,
        name,
        email,
        storeId,
        hourlyRate,
        posId,
      }),
    });
    setSaving(false);
    setEditModal(null);
    reload();
  };

  const handleDelete = async (id: string, castName: string) => {
    if (!confirm(`${castName}を削除しますか？`)) return;
    await fetch("/api/casts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    reload();
  };

  // 選択中の店舗のキャストのみ
  const selectedStoreName = stores.find((s) => s.id === selectedStore)?.name || "";
  const storeCasts = casts.filter((c) => c.storeId === selectedStore);

  const formModal = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>名前</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="キャスト名" />
      </div>
      <div className="space-y-1">
        <Label>メールアドレス</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@cast.local" />
      </div>
      <div className="space-y-1">
        <Label>所属店舗</Label>
        <select
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>時給（円）</Label>
        <Input
          type="number"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
          placeholder="1800"
        />
      </div>
      <div className="space-y-1">
        <Label>POS ID（POS連携用）</Label>
        <Input
          value={posId}
          onChange={(e) => setPosId(e.target.value)}
          placeholder="POS側のキャストID"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 店舗タブ */}
      <div className="flex border-b border-gray-300 overflow-x-auto">
        {stores.map((s) => {
          const count = casts.filter((c) => c.storeId === s.id).length;
          return (
            <button
              key={s.id}
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

      {/* キャスト追加ボタン */}
      <div className="flex items-center gap-3">
        <Button className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white" onClick={openAdd}>
          + キャスト追加
        </Button>
        <span className="text-sm text-gray-500">
          {selectedStoreName}：{storeCasts.length}名
        </span>
      </div>

      {/* キャスト一覧テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">名前</th>
              <th className="border border-gray-300 px-3 py-2 text-left">メール</th>
              <th className="border border-gray-300 px-3 py-2 text-center">時給</th>
              <th className="border border-gray-300 px-3 py-2 text-center">POS ID</th>
              <th className="border border-gray-300 px-3 py-2 text-center w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            {storeCasts.length === 0 ? (
              <tr>
                <td colSpan={5} className="border border-gray-300 px-3 py-8 text-center text-gray-400">
                  キャストが登録されていません
                </td>
              </tr>
            ) : (
              storeCasts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-3 py-1.5 font-medium">{c.name}</td>
                  <td className="border border-gray-300 px-3 py-1.5 text-gray-500 text-xs">{c.email}</td>
                  <td className="border border-gray-300 px-3 py-1.5 text-center">
                    {c.hourlyRate ? `${c.hourlyRate.toLocaleString()}円` : "-"}
                  </td>
                  <td className="border border-gray-300 px-3 py-1.5 text-center text-xs text-gray-500">
                    {c.posId || "-"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800 mr-2"
                      onClick={() => openEdit(c)}
                    >
                      編集
                    </button>
                    <button
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

      {/* 追加モーダル */}
      {addModal && (
        <Modal open title={`${selectedStoreName} - キャスト追加`} onClose={() => setAddModal(false)}>
          {formModal}
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setAddModal(false)}>キャンセル</Button>
            <Button onClick={handleAdd} disabled={saving || !name || !email} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
              {saving ? "保存中..." : "追加"}
            </Button>
          </div>
        </Modal>
      )}

      {/* 編集モーダル */}
      {editModal && (
        <Modal open title={`${editModal.name} を編集`} onClose={() => setEditModal(null)}>
          {formModal}
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setEditModal(null)}>キャンセル</Button>
            <Button onClick={handleUpdate} disabled={saving || !name || !email} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
              {saving ? "保存中..." : "更新"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
