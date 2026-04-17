"use client";

import { useState } from "react";

type Props = {
  periodId: string;
  sheetsConfigured: boolean;
  /** 希望締切中は取り込み不可 */
  disabled?: boolean;
  /** 回答シート名（省略時は API デフォルト） */
  defaultSheetName?: string;
};

export function FormImportButton({
  periodId,
  sheetsConfigured,
  disabled = false,
  defaultSheetName = "",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const run = async () => {
    if (disabled) {
      setMessage("締め切りのため取り込めません（希望締切またはシフト追加締切）");
      return;
    }
    if (!sheetsConfigured) {
      setMessage("Google Sheets 連携が未設定です（.env の GOOGLE_*）");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/form-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          sheetName: defaultSheetName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || data.error || "取り込みに失敗しました");
        setLoading(false);
        return;
      }
      const errPart =
        Array.isArray(data.errors) && data.errors.length > 0
          ? ` / 注意: ${data.errors.slice(0, 3).join("；")}`
          : "";
      setMessage(`${data.message || "完了"}${errPart}`);
      if (data.success) window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "エラー");
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="text-xs rounded-md border border-sky-300 bg-white px-2 py-1 text-sky-800 hover:bg-sky-50 disabled:opacity-50"
        onClick={() => void run()}
        disabled={loading || disabled}
      >
        {loading ? "取り込み中…" : "フォーム回答を取り込み"}
      </button>
      {message && <span className="max-w-[280px] text-right text-xs text-gray-600">{message}</span>}
    </div>
  );
}
