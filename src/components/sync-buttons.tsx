"use client";

import { useState } from "react";

export function SyncButtons({
  periodId,
  sheetsImportDisabled = false,
}: {
  periodId: string;
  /** シフト追加締切中は Sheets 取込を無効化 */
  sheetsImportDisabled?: boolean;
}) {
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const sync = async (direction: "toSheets" | "fromSheets") => {
    setSyncing(direction);
    setMessage("");

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, periodId }),
    });

    const data = await res.json();
    setMessage(data.message || (data.success ? "完了" : "エラー"));
    setSyncing(null);

    if (data.success && direction === "fromSheets") {
      window.location.reload();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        className="text-xs text-green-600 hover:text-green-800 px-2 py-1 border border-green-200 rounded disabled:opacity-50"
        onClick={() => sync("toSheets")}
        disabled={!!syncing}
      >
        {syncing === "toSheets" ? "同期中..." : "Sheets書出"}
      </button>
      <button
        type="button"
        title={sheetsImportDisabled ? "シフト追加締切中は取込できません" : undefined}
        className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 border border-purple-200 rounded disabled:opacity-50"
        onClick={() => sync("fromSheets")}
        disabled={!!syncing || sheetsImportDisabled}
      >
        {syncing === "fromSheets" ? "取込中..." : "Sheets取込"}
      </button>
      {message && (
        <span className="text-xs text-gray-500 ml-1">{message}</span>
      )}
    </div>
  );
}
