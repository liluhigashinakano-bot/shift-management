"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-xl w-full border border-gray-200 rounded-lg p-6 bg-white space-y-3">
        <div className="text-lg font-bold text-gray-800">ダッシュボードでエラーが発生しました</div>
        <div className="text-sm text-gray-600">
          期間の切り替え処理で例外が発生している可能性があります。
        </div>
        {error?.message && (
          <div className="text-sm bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap">
            {error.message}
          </div>
        )}
        {error?.digest && (
          <div className="text-xs text-gray-500">digest: {error.digest}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            onClick={() => reset()}
          >
            再試行
          </button>
          <a
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            href="/dashboard"
          >
            ダッシュボードに戻る
          </a>
        </div>
      </div>
    </div>
  );
}

