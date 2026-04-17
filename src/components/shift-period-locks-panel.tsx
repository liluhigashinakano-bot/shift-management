"use client";

import { useState, useEffect, useRef } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [reqLocked, setReqLocked] = useState(initialRequestsLocked);
  const [slotLocked, setSlotLocked] = useState(initialSlotsLocked);
  const [loadingReq, setLoadingReq] = useState(false);
  const [loadingSlot, setLoadingSlot] = useState(false);

  useEffect(() => {
    setReqLocked(initialRequestsLocked);
  }, [initialRequestsLocked]);

  useEffect(() => {
    setSlotLocked(initialSlotsLocked);
  }, [initialSlotsLocked]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleReq = async () => {
    setLoadingReq(true);
    try {
      const res = await fetch(`/api/shift-periods/${periodId}/shift-requests-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !reqLocked }),
      });
      const data = await res.json();
      if (res.ok) {
        setReqLocked(Boolean(data.shiftRequestsLocked));
        router.refresh();
      }
    } finally {
      setLoadingReq(false);
    }
  };

  const toggleSlot = async () => {
    setLoadingSlot(true);
    try {
      const res = await fetch(`/api/shift-periods/${periodId}/shift-slots-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !slotLocked }),
      });
      const data = await res.json();
      if (res.ok) {
        setSlotLocked(Boolean(data.shiftSlotsLocked));
        router.refresh();
      }
    } finally {
      setLoadingSlot(false);
    }
  };

  const anyLocked = reqLocked || slotLocked;

  return (
    <div ref={rootRef} className="relative inline-block">
      <Button
        type="button"
        size="xs"
        variant={anyLocked ? "outline" : "default"}
        className={
          anyLocked
            ? "h-6 border-amber-300/80 text-amber-900 bg-amber-50/90 hover:bg-amber-100 text-[10px] px-2"
            : "h-6 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-600 hover:from-pink-600 hover:via-purple-600 hover:to-cyan-700 text-white text-[10px] px-2"
        }
        onClick={() => setOpen((o) => !o)}
      >
        締切設定
        {anyLocked ? " ●" : ""}
      </Button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-[min(calc(100vw-1.5rem),260px)] rounded-md border border-gray-200 bg-white p-2 shadow-lg"
          role="dialog"
          aria-label="締切設定"
        >
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-gray-600">シフト希望</div>
              <Button
                type="button"
                size="xs"
                variant={reqLocked ? "outline" : "default"}
                className={
                  reqLocked
                    ? "h-6 w-full border-amber-300 text-amber-900 bg-amber-50 text-[10px]"
                    : "h-6 w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white text-[10px]"
                }
                disabled={loadingReq}
                onClick={() => void toggleReq()}
              >
                {loadingReq ? "…" : reqLocked ? "締切を解除" : "希望を締め切る"}
              </Button>
              {reqLocked && (
                <p className="text-[10px] leading-snug text-amber-900/85">
                  希望の登録・取り込み・表からの追加（希望連動）を停止します。
                </p>
              )}
            </div>
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="text-[10px] font-medium text-gray-600">シフト表の追加・変更</div>
              <Button
                type="button"
                size="xs"
                variant={slotLocked ? "outline" : "default"}
                className={
                  slotLocked
                    ? "h-6 w-full border-sky-300 text-sky-900 bg-sky-50 text-[10px]"
                    : "h-6 w-full bg-gradient-to-r from-sky-600 to-cyan-600 text-white text-[10px]"
                }
                disabled={loadingSlot}
                onClick={() => void toggleSlot()}
              >
                {loadingSlot ? "…" : slotLocked ? "締切を解除" : "追加・変更を締め切る"}
              </Button>
              {slotLocked && (
                <p className="text-[10px] leading-snug text-sky-900/85">
                  表の追加・削除・ドラッグ、Sheets取込・フォーム反映などを停止します。
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
