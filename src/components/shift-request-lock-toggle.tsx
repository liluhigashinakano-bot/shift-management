"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  periodId: string;
  initialLocked: boolean;
};

export function ShiftRequestLockToggle({ periodId, initialLocked }: Props) {
  const router = useRouter();
  const [locked, setLocked] = useState(initialLocked);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocked(initialLocked);
  }, [initialLocked]);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shift-periods/${periodId}/shift-requests-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !locked }),
      });
      const data = await res.json();
      if (res.ok) {
        setLocked(Boolean(data.shiftRequestsLocked));
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
            ? "border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
            : "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
        }
        disabled={loading}
        onClick={() => void toggle()}
      >
        {loading ? "処理中…" : locked ? "締め切り解除" : "シフト希望締め切り"}
      </Button>
      {locked && (
        <p className="text-xs text-amber-800/90 max-w-md">
          締め切り中です。キャストは希望の追加・編集・削除ができません。管理者・社員向けの希望登録・取り込み・シフト表からのキャスト追加も停止されています。
        </p>
      )}
    </div>
  );
}
