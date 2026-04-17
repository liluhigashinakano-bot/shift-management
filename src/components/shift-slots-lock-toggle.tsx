"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  periodId: string;
  initialLocked: boolean;
};

export function ShiftSlotsLockToggle({ periodId, initialLocked }: Props) {
  const router = useRouter();
  const [locked, setLocked] = useState(initialLocked);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocked(initialLocked);
  }, [initialLocked]);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shift-periods/${periodId}/shift-slots-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !locked }),
      });
      const data = await res.json();
      if (res.ok) {
        setLocked(Boolean(data.shiftSlotsLocked));
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={locked ? "outline" : "default"}
        className={
          locked
            ? "border-sky-300 text-sky-900 bg-sky-50 hover:bg-sky-100"
            : "bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-700 hover:to-cyan-700 text-white"
        }
        disabled={loading}
        onClick={() => void toggle()}
      >
        {loading ? "処理中…" : locked ? "シフト追加締切を解除" : "シフト追加締め切り"}
      </Button>
      {locked && (
        <p className="text-xs text-sky-900/90 max-w-md">
          締切中です。シフト表のキャスト追加・削除・時間変更、ドラッグ移動、Sheets取込・フォーム取込によるシフト反映はできません（希望の締め切りとは別設定です）。
        </p>
      )}
    </div>
  );
}
