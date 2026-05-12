/**
 * Railway 等で NEXT_PUBLIC_APP_ENV=staging のときだけ表示。
 * ビルド時に環境変数が渡る前提（ステージング用サービスの Variables で設定）。
 */
export function StagingBanner() {
  const env = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (env !== "staging") return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] border-b border-amber-700/40 bg-amber-500 px-3 py-2 text-center text-sm font-semibold text-amber-950 shadow-sm"
    >
      ステージング環境です（本番とはデータ・URL が別です）
    </div>
  );
}
