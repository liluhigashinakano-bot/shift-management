"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  periodId: string;
  initialPublished: boolean;
};

export function AdjustmentConfirmedPublishPanel({
  periodId,
  initialPublished,
}: Props) {
  const router = useRouter();
  const [published, setPublished] = useState(initialPublished);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPublished(initialPublished);
  }, [initialPublished]);

  const setPublishedApi = async (next: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/shift-periods/${periodId}/adjustment-confirmed-publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published: next }),
        },
      );
      const data = (await res.json()) as { adjustmentConfirmedPublished?: boolean };
      if (res.ok) {
        setPublished(Boolean(data.adjustmentConfirmedPublished));
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="xs"
      variant={published ? "outline" : "default"}
      title={
        published
          ? "クリックでロックを解除します。調整一覧の「確定」列が隠れ、シフト表・希望・調整を再編集できるようになります。"
          : "調整一覧の「確定」列に、現在のシフト表（調整反映後）を表示し、編集をロックします。"
      }
      className={
        published
          ? "h-6 border-emerald-300/80 text-emerald-900 bg-emerald-50/90 hover:bg-emerald-100 text-[clamp(8px,2.2vw,10px)] px-1.5 sm:px-2 whitespace-nowrap shrink-0"
          : "h-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[clamp(8px,2.2vw,10px)] px-1.5 sm:px-2 whitespace-nowrap shrink-0"
      }
      disabled={loading}
      onClick={() => {
        if (loading) return;
        void setPublishedApi(!published);
      }}
    >
      {loading ? "…" : published ? "シフトロック中" : "シフトを確定する"}
    </Button>
  );
}
