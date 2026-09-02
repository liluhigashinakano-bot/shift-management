"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { postJson } from "@/lib/api-request";

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setPublished(initialPublished);
  }, [initialPublished]);

  const setPublishedApi = async (next: boolean) => {
    setLoading(true);
    try {
      const result = await postJson(
        `/api/shift-periods/${periodId}/adjustment-confirmed-publish`,
        { published: next },
        { fallbackMessage: "シフトの確定を切り替えられませんでした" },
      );
      if (!result.ok) return;
      const data = result.data as { adjustmentConfirmedPublished?: boolean } | null;
      setPublished(Boolean(data?.adjustmentConfirmedPublished));
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const onClick = () => {
    if (loading) return;
    if (!published) {
      // 「シフトを確定する」だけ確認モーダルを挟む
      setConfirmOpen(true);
      return;
    }
    void setPublishedApi(false);
  };

  const onConfirm = async () => {
    setConfirmOpen(false);
    await setPublishedApi(true);
  };

  return (
    <>
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
        onClick={onClick}
      >
        {loading ? "…" : published ? "シフトロック中" : "シフトを確定する"}
      </Button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="シフトを確定する"
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
            className="px-3 py-1.5 text-sm rounded-md text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            はい
          </button>
        </div>
      </Modal>
    </>
  );
}
