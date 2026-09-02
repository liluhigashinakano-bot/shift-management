"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { errorMessageFromResponse } from "@/lib/api-request";
import { toast } from "sonner";

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
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      if (!resReq.ok || !resSlot.ok) {
        // 失敗した理由を出す（出さないと「押しても変わらない」に見える）
        const failed = !resReq.ok ? resReq : resSlot;
        toast.error(await errorMessageFromResponse(failed, "締切を切り替えられませんでした"));
        router.refresh();
        return;
      }
      const dataReq = (await resReq.json()) as { shiftRequestsLocked?: boolean };
      const dataSlot = (await resSlot.json()) as { shiftSlotsLocked?: boolean };
      setReqLocked(Boolean(dataReq.shiftRequestsLocked));
      setSlotLocked(Boolean(dataSlot.shiftSlotsLocked));
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const onClick = () => {
    if (loading) return;
    if (bothUnlocked) {
      // 「希望を締め切る」だけ確認モーダルを挟む
      setConfirmOpen(true);
      return;
    }
    void applyBoth(false);
  };

  const onConfirm = async () => {
    setConfirmOpen(false);
    await applyBoth(true);
  };

  return (
    <>
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

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="希望を締め切る"
      >
        <p className="text-sm text-gray-700 mb-5">実行しますか？</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              void onConfirm();
            }}
            className="px-3 py-1.5 text-sm rounded-md text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-600 hover:from-pink-600 hover:via-purple-600 hover:to-cyan-700"
          >
            はい
          </button>
        </div>
      </Modal>
    </>
  );
}
