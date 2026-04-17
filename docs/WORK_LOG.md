# 作業ログ

このリポジトリでの変更・デプロイ・運用メモを時系列で残します。  
エージェントや人間が作業したら、**そのセッションの末尾に追記**してください。

---

## テンプレ（コピーして使う）

```
### YYYY-MM-DD

**概要:** （1〜3行）

**変更ファイル（主なもの）:**
- `path/to/file`

**Git:** （該当時）コミット `abc1234` / ブランチ `main` / push 済み など

**メモ:** （任意：URL、環境変数、手動でやったこと）
```

---

### 2026-04-17

**概要:** ログイン画面の文言を「キャストID」表記に統一（ラベル・プレースホルダー・エラー文・フッター文言）。

**変更ファイル（主なもの）:**
- `src/app/login/page.tsx`

**Git:** コミット `b4b2d2d`（メッセージ: ログイン画面の文言をキャストID表記に統一）/ `main` / `origin` へ push 済み

**メモ:** Railway は GitHub `main` 連携時、push で自動デプロイ想定。

---

### 2026-04-17（運用ルール）

**概要:** 今後の作業ごとに本ファイルへログを残す運用を開始。`.cursor/rules` に追記ルールを追加。

**変更ファイル（主なもの）:**
- `docs/WORK_LOG.md`
- `.cursor/rules/work-session-log.mdc`

**Git:** `main` にコミット済み（履歴は `git log --oneline -5` で確認）

---

### 2026-04-18

**概要:** 費用がかかる可能性がある作業は進めず中止し、ユーザー確認とするよう Cursor ルール（`.cursor/rules/no-paid-actions.mdc`）を追加。

**変更ファイル（主なもの）:**
- `.cursor/rules/no-paid-actions.mdc`
- `docs/WORK_LOG.md`

**Git:** コミット `a37f0f8` / `main` / push 済み

---

### 2026-04-18（フォント）

**概要:** 全体のサンセリフを Google Fonts の **Kosugi Maru（小杉丸）** に変更。`next/font/google` の `Kosugi_Maru` を `--font-kosugi-maru` で適用し、`globals.css` の `--font-sans` を接続。等幅は従来どおり `Geist_Mono`。

**変更ファイル（主なもの）:**
- `src/app/layout.tsx`
- `src/app/globals.css`
- `docs/WORK_LOG.md`

**Git:** コミット `c7075db` / `main` / push 済み

---

### 2026-04-18（レスポンシブ・モバイル）

**概要:** スマホ・タブレット利用を想定し、viewport（`viewportFit: cover`・最大ズーム 5）、セーフエリア、`100dvh`、横スクロール抑止、タップ最適化（`touch-action: manipulation`）を追加。ヘッダーは `md` 未満でハンバーガー＋シートメニュー。各ページの `main` に `w-full min-w-0` と段階的パディング。

**変更ファイル（主なもの）:**
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/nav-header.tsx`
- `src/app/dashboard/page.tsx`（タイトル・フィルタの折り返し）
- 各 `page.tsx`（`min-h-dvh`、`main` のパディング）

**Git:** コミット `ebee607` / `main` / push 済み

---

### 2026-04-18（退勤列の表示行）

**概要:** 退勤が**整数時**（例 20:00, 24:00）のとき、DB 上の `isEnd` は直前の半時スロットに付くが、画面上の退勤列は**その時刻の :00 行**にキャスト名を表示する。`displaySlotForClockOut` を `shift-utils` に追加し、シフト編集グリッド・確定シフト表・Google Sheets 同期（DB→シート）で共通利用。

**変更ファイル（主なもの）:**
- `src/lib/shift-utils.ts`
- `src/components/shift-grid/shift-grid.tsx`
- `src/components/confirmed-shift.tsx`
- `src/lib/sheet-sync.ts`
- `docs/WORK_LOG.md`

**Git:** コミット `e7a73c1` / `main` / push 済み

---

### 2026-04-18（シフト希望締切）

**概要:** `ShiftPeriod.shiftRequestsLocked` を追加。シフト表画面で「シフト希望締め切り」／「締め切り解除」トグル。締切中は `/api/requests` の作成・一括・削除・ステータス更新、`/api/shifts` の `addCast`（希望レコード作成）、フォーム取り込みを拒否。希望一覧・マイページの UI も無効化。

**変更ファイル（主なもの）:**
- `prisma/schema.prisma` / `prisma/migrations/20260418120000_shift_requests_locked/migration.sql`
- `src/lib/shift-request-lock.ts`
- `src/app/api/shift-periods/[periodId]/shift-requests-lock/route.ts`
- `src/app/api/requests/route.ts`, `src/app/api/shifts/route.ts`, `src/app/api/form-import/route.ts`
- `src/app/shifts/.../page.tsx`, `src/components/shift-request-lock-toggle.tsx`
- `src/components/request-form.tsx`, `src/components/mypage-form.tsx`, `src/components/form-import-button.tsx`
- `src/components/shift-grid/cast-add-dialog.tsx`, `shift-grid.tsx`
- `src/app/requests/.../page.tsx`, `docs/WORK_LOG.md`

**Git:** コミット `f79ad93` / `main` / push 済み

**メモ:** 本番反映後に `prisma migrate deploy` が必要。

---

### 2026-04-18（シフト追加締切）

**概要:** `ShiftPeriod.shiftSlotsLocked` を追加。シフト表で「シフト追加締め切り」／「シフト追加締切を解除」トグル（希望締切とは別）。締切中はシフト表の追加・削除・時間変更・ドラッグ、スロット管理者メモ、`/api/shifts` の `addCast`/`removeCast`/`editCast`/`updateSlotMemo`、希望登録でシフト表へ即時反映する処理、フォーム取込、Sheets 取込を拒否。Sheets 書出は可。

**変更ファイル（主なもの）:**
- `prisma/schema.prisma` / `prisma/migrations/20260418140000_shift_slots_locked/migration.sql`
- `src/lib/shift-slot-lock.ts`
- `src/app/api/shift-periods/[periodId]/shift-slots-lock/route.ts`
- `src/app/api/shifts/route.ts`, `src/app/api/requests/route.ts`, `src/app/api/form-import/route.ts`, `src/app/api/sync/route.ts`
- `src/components/shift-slots-lock-toggle.tsx`, `src/app/shifts/.../page.tsx`, `src/components/sync-buttons.tsx`
- `src/components/shift-grid/*`, `src/app/requests/.../page.tsx`, `src/components/form-import-button.tsx`
- `docs/WORK_LOG.md`

**メモ:** 本番 DB に `npx prisma migrate deploy`（マイグレーション `20260418140000_shift_slots_locked`）。

**Git:** コミット `ccc2617` / `main`

---

### 2026-04-18（締切 UI 集約）

**概要:** 希望／シフト表の2締切を「締切設定」1ボタン＋パネルに統合。メインボタンは `xs`（従来より小さく）。

**変更ファイル（主なもの）:**
- `src/components/shift-period-locks-panel.tsx`（新規）
- `src/app/shifts/[storeId]/[periodId]/page.tsx`
- 削除: `shift-request-lock-toggle.tsx`, `shift-slots-lock-toggle.tsx`

**Git:** コミット `4e942a8` / `main`

---
