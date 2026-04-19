"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  periodId: string;
  initialRequestsLocked: boolean;
  initialSlotsLocked: boolean;
};

export function ShiftPeriodLocksPanel({
  periodId,
  initialRequestsLocked,
  initialSlotsLocked,
}: Props) {
  const router = useRouter();
  const [reqLocked, setReqLocked] = useState(initialRequestsLocked);
  const [slotLocked, setSlotLocked] = useState(initialSlotsLocked);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setReqLocked(initialRequestsLocked);
  }, [initialRequestsLocked]);

  useEffect(() => {
    setSlotLocked(initialSlotsLocked);
  }, [initialSlotsLocked]);

  /** 両方とも未締切のときだけ true（このときクリックでキャスト向けに希望＋表反映を締め切る） */
  const bothUnlocked = !reqLocked && !slotLocked;
  const anyLocked = reqLocked || slotLocked;

  const applyBoth = async (locked: boolean) => {
    setLoading(true);
    try {
      const [resReq, resSlot] = await Promise.all([
        fetch(`/api/shift-periods/${periodId}/shift-requests-lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locked }),
        }),
        fetch(`/api/shift-periods/${periodId}/shift-slots-lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locked }),
        }),
      ]);
      const dataReq = await resReq.json();
      const dataSlot = await resSlot.json();
      if (resReq.ok && resSlot.ok) {
        setReqLocked(Boolean(dataReq.shiftRequestsLocked));
        setSlotLocked(Boolean(dataSlot.shiftSlotsLocked));
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const onClick = () => {
    if (loading) return;
    void applyBoth(bothUnlocked);
  };

  return (
    <Button
      type="button"
      size="xs"
      variant={anyLocked ? "outline" : "default"}
      title={
        bothUnlocked
          ? "キャスト本人のシフト希望の登録・変更と、それに伴うシフト表への反映を締め切ります。管理者・従業員のシフト表の編集や取り込みはそのまま行えます。"
          : "キャスト向けの希望締切とシフト表反映の締切をまとめて解除します。"
      }
      className={
        anyLocked
          ? "h-6 border-amber-300/80 text-amber-900 bg-amber-50/90 hover:bg-amber-100 text-[clamp(8px,2.2vw,10px)] px-1.5 sm:px-2 whitespace-nowrap shrink-0"
          : "h-6 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-600 hover:from-pink-600 hover:via-purple-600 hover:to-cyan-700 text-white text-[clamp(8px,2.2vw,10px)] px-1.5 sm:px-2 whitespace-nowrap shrink-0"
      }
      disabled={loading}
      onClick={onClick}
    >
      {loading
        ? "…"
        : bothUnlocked
          ? "希望を締め切る"
          : "締切を解除"}
    </Button>
  );
}
