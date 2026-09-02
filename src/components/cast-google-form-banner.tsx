"use client";

import Link from "next/link";

type Props = {
  formUrl: string;
  /** この期間でフォームに入力できる日付（YYYY-MM-DD） */
  validDatesYmd: string[];
};

export function CastGoogleFormBanner({ formUrl, validDatesYmd }: Props) {
  const sample = validDatesYmd.slice(0, 5).join(", ");
  const more = validDatesYmd.length > 5 ? ` …他${validDatesYmd.length - 5}日` : "";

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
      <p className="font-medium text-sky-900">Googleフォームで希望を提出する</p>
      <p className="mt-1 text-sky-800/90">
        フォームから送信した内容は、管理者が「フォームから取り込み」を実行するとこの一覧に反映されます（アプリ上の登録と併用できます）。
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-900/90">
        <li>最初の欄には、ログインに使う<strong>キャストID</strong>を入力してください。</li>
        <li>
          日付は<strong>YYYY-MM-DD</strong>形式（例: 2026-04-17）。この期間の日付例: {sample}
          {more}
        </li>
        <li>
          出勤・退勤は<strong>数値</strong>（19〜29、30分単位は 20.5 のように .5）。アプリの希望登録と同じ基準です。
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={formUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-700"
        >
          Googleフォームを開く
        </Link>
      </div>
    </div>
  );
}
