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

**Git:** コミット `258dab6` / `main`

---

### 2026-04-17（利用マニュアル）

**概要:** 初心者向けの利用手引き `docs/USER_MANUAL.md` を新規作成。実スクショ差し替え用に `docs/manual-images/README.md`（推奨ファイル名一覧）を追加。本文では「画面のイメージ」枠で見どころを文章化。

**変更ファイル（主なもの）:**
- `docs/USER_MANUAL.md`
- `docs/manual-images/README.md`

---

### 2026-04-18（マニュアル画像の埋め込み）

**概要:** ユーザー提供のスクショを `docs/manual-images/` に短いファイル名でコピーし、`USER_MANUAL.md` に `![](manual-images/...)` で埋め込み。§11 にキャスト・店舗の操作手順を追記。

**変更ファイル（主なもの）:**
- `docs/manual-images/*.png`（14 ファイル）
- `docs/USER_MANUAL.md`
- `docs/manual-images/README.md`

---

### 2026-04-18（キャスト向けマニュアル）

**概要:** キャスト専用アカウントの画面キャプチャ 6 枚を `cast-01`〜`cast-06` として `docs/manual-images/` に配置。本文は `docs/CAST_MANUAL.md` に新設。`USER_MANUAL.md` §10 は `CAST_MANUAL` への参照に差し替え。PDF は `npm run docs:pdf:cast` で `docs/CAST_MANUAL.pdf` を出力できるよう `print-manual-pdf.mjs` を引数対応に拡張。

**変更ファイル（主なもの）:**
- `docs/CAST_MANUAL.md`
- `docs/manual-images/cast-0*.png`（6 ファイル）
- `docs/USER_MANUAL.md`, `docs/manual-images/README.md`
- `scripts/print-manual-pdf.mjs`, `package.json`

---

### 2026-04-18（PDF レイアウト：項目とスクショを同じシートに）

**概要:** `print-manual-pdf.mjs` で Markdown 変換後の HTML を各 `h2` 単位で `<section class="manual-sheet">` に包み、印刷時に `page-break-inside: avoid` と画像の `max-height` を指定。`USER_MANUAL.pdf` / `CAST_MANUAL.pdf` を再生成。

**変更ファイル（主なもの）:**
- `scripts/print-manual-pdf.mjs`
- `docs/manual-images/README.md`
- `docs/*.pdf`

---

### 2026-04-18（CAST_MANUAL 注記の削除）

**概要:** `CAST_MANUAL.md` から「スクリーンショット／`cast-*.png` のパス・上書き」に関する注記を削除。`CAST_MANUAL.pdf` を再生成。

**変更ファイル（主なもの）:**
- `docs/CAST_MANUAL.md`
- `docs/CAST_MANUAL.pdf`
- `docs/WORK_LOG.md`

---

### 2026-04-18（PDF：画像だけのページを減らす）

**概要:** `print-manual-pdf.mjs` の印刷 CSS で `.manual-sheet` の `page-break-inside: avoid` をやめ、セクション内改ページを許可。本文・リスト・見出し直後の `p:has(img)` に `break-before: avoid` を指定。画像 `max-height` を 46vh に。`USER_MANUAL.pdf` / `CAST_MANUAL.pdf` を再生成。

**変更ファイル（主なもの）:**
- `scripts/print-manual-pdf.mjs`
- `docs/manual-images/README.md`
- `docs/*.pdf`
- `docs/WORK_LOG.md`

---

### 2026-04-18（希望一覧：行クリックで編集・削除）

**概要:** 希望一覧の行クリックで「シフト希望登録」と同じモーダルを開き、時間・備考の変更と削除。API に `action: "update"` を追加。希望削除時にシフト表スロットを除去。キャスト画面の表示用備考は `notesRaw` で編集に渡す。

**変更ファイル（主なもの）:**
- `src/components/request-form.tsx`
- `src/app/api/requests/route.ts`
- `src/app/requests/[storeId]/[periodId]/page.tsx`
- `docs/WORK_LOG.md`

---

### 2026-04-18（シフト表の印刷：ヘッダー非表示・横向き・日付ブロック改ページ）

**概要:** シフト表画面で印刷時に画面上部ツールバー（ダッシュボードリンク・締切・他画面リンク等）を `print:hidden`。既存の `globals.css` で `header` 非表示は継続。表をカレンダー日 1〜8 / 9〜15 / 16〜23 / 24〜31 で塊分けし、塊の間で改ページ。横向き `@page` は `ShiftPrintStyles` でマウント時のみ head に注入。

**変更ファイル（主なもの）:**
- `src/components/shift-grid/shift-grid.tsx`
- `src/components/shift-grid/shift-print-styles.tsx`
- `src/app/shifts/[storeId]/[periodId]/page.tsx`
- `src/app/globals.css`
- `docs/WORK_LOG.md`

---

### 2026-04-19（シフト表印刷プレビュー：ツールバー確実に非表示）

**概要:** `print:hidden` だけではプレビューにツールバーが残る環境があるため、ツールバーに `shift-sheet-toolbar-print-hide` を付与し、`@media print` で `display: none !important`。ルートに `shift-sheet-print-page` を付与し、同ページの `header` を明示。

**変更ファイル（主なもの）:**
- `src/app/shifts/[storeId]/[periodId]/page.tsx`
- `src/app/globals.css`
- `docs/WORK_LOG.md`

---

### 2026-04-19（シフト表印刷：1〜8日チャンクを1ページに収める）

**概要:** 表最小幅が横向き印字幅を超え列（メモ列含む）が次ページに分割されていたため、日付チャンクに `shift-print-chunk` を付与し印刷時 `zoom: 0.74` で縮小。`page-break-inside: avoid` と `tbody.shift-print-summary-tbody` のまとまり維持。`shift-print-grid-root` でチャンク間の `space-y` を印刷時オフ。

**変更ファイル（主なもの）:**
- `src/components/shift-grid/shift-grid.tsx`
- `src/components/shift-grid/shift-print-styles.tsx`
- `docs/WORK_LOG.md`

---

### 2026-09-02（網羅レビュー）

**概要:** コード全文（約 15,600 行）・型検査・lint・テストから、不具合と操作性の問題を 37 件洗い出した。コードの変更はなし。結果は点検報告（Artifact）にまとめた: https://claude.ai/code/artifact/629478b6-d3ef-4177-925f-536e2e27b345

**重いもの（危険 5 件）:**
- `/api/casts` GET と `casts/page.tsx` がキャスト全員の `passwordHash`・`hourlyRate` をそのままブラウザへ渡している（6 桁 PIN なので総当たりで割り出せる）
- シフト表の「元に戻す」（restoreSnapshot）が期間の希望を全部消して作り直すため、その間にキャストが出した希望が消える
- 出勤を退勤より遅くすると退勤の値が古いまま送られ、退勤＜出勤の希望が保存される（画面 5 か所、裏側の確認なし）
- 「＋追加シフト」で同じ日に同じキャストを 2 回入れると先の枠が消える（addCast がその日の枠を全削除してから作る）
- 保存失敗を知らせない画面が 8 か所（窓が閉じて成功に見える）

**確かめたこと:** tsc ○（ソース側の誤りなし）／ npm test ○（4 本 49 件）／ lint ×（100 件、ほぼ any と未使用変数）
**確かめていないこと:** ブラウザ・実機で触っていない（ログインが要るためこの席では不可、手元 DB も空）。Railway の TZ 設定、5 月に戻した「メニューの膜が残る」の再現。

**変更ファイル:** `docs/WORK_LOG.md` のみ

**Git:** 未コミット

### 2026-09-02（網羅レビューの指摘を修正）

**概要:** 上のレビューで挙げた 37 件のうち **36 件を修正**。残り 1 件（作業中の控えファイルの削除）は消すと戻せないため未実施。コード変更 56 ファイル、新規 12 ファイル。

**危険（5 件）**
- `/api/casts` と `casts/page.tsx` が返す項目を `CAST_PUBLIC_SELECT` に絞り、`passwordHash`・`hourlyRate`・`posId` がブラウザへ渡らないようにした
- 「元に戻す」（restoreSnapshot）からシフト希望を外した。巻き戻すのはシフト表だけ。あわせて `addCast` が作っていた合成の希望と `removeCast` の希望削除も廃止（→ 中20 も同時に解消）
- 出勤・退勤の妥当性を `isValidShiftRange` に集約し、裏側（`/api/shifts` `/api/requests` `/api/adjustments` `/api/form-import`）で必ず通す。画面側は `clampEndToStart` で出勤を変えたとき退勤を寄せる
- `addCast` は重なる時間帯だけ差し替える（以前はその日のスロットを全削除）。境界の出勤・退勤の印は `repairSlotBoundaries` で付け直す
- 保存の失敗を必ず知らせる。`src/lib/api-request.ts` の `postJson` を作り、追加シフト・時間編集・削除・日別情報・企画名等・枠メモ・ドラッグ・店舗管理・締切・シフト確定・元に戻すから呼ぶ。失敗時は窓を閉じない

**高（9 件）**
- 店舗管理は管理者だけに操作ボタンを出す（裏側と一致）。店舗名は空・重複・50 文字超を弾く
- 従業員ID とキャストID を大文字小文字を無視して相互に重複チェック（`findExistingStaffLogin` / `findExistingCastForCreate`）
- 最後の管理者の降格・自分の権限変更を禁止
- 閲覧者は全店舗に統一。権限設定の画面から店舗の指定欄を消し、「閲覧者は全店舗」と明記
- 利用者が消えたらログインを無効化。パスワードの指紋（`pwf`）をログインに持たせ、再発行で他端末を追い出す
- 期間の判定を日本時間に統一（`src/lib/jst.ts`）。深夜 0〜9 時のずれを解消
- 本番への列追加は「デプロイ後に手で `prisma migrate deploy`」に一本化。Dockerfile の説明・`package.json` の `start`・`docs/STAGING.md` の食い違いを解消
- `ensureShiftPeriod` を upsert ＋ `createMany(skipDuplicates)` に変更（同時に開いてもエラー画面にならない。書き込みも 1 店舗 15〜16 回 → 2 回）
- 確定前のシフトはキャストに見せない（確定シフトは案内文、調整一覧は「確定」欄を出さない）

**中（14 件）** 希望の付け替え時の重複を 409 で弾く／付け替えで時間と備考を持ち越す／締切中も内容を見られる（変更ボタンだけ無効）／枠メモが読み直しに追従／マイページと希望一覧の入口で期間を作る／Google フォームはキャストID で突き合わせ／`/mypage` は管理者・従業員をダッシュボードへ（`mypage-form.tsx` 削除）／ログインの失敗回数制限（同じ ID で 5 回 → 10 分）／ヘルプ先の店舗一覧を店舗テーブルから作る／体入はどの日にも載らなくなったら利用者ごと削除／スプレッドシート連携は「まとめて 1 回で書き込む」「出勤〜退勤の全スロットを作る」「備考の JSON をそのまま書かない」／希望・調整の受け口に店舗の確認を追加

**低（9 件）** 書き方の検査 100 件 → 0 件（`as any` を型で置き換え）／ログイン文言の統一／固定の「7店舗」を削除／閲覧時のカーソル／コピー失敗の表示／＋営業情報・＋追加シフトの当たりを拡大／マニュアルの誤字 2 件／`db.ts` の空文字対策

**新しく足したテスト:** `shift-time-range`（24）・`jst`（12）・`login-attempts`（10）。既存とあわせて 7 本 95 件がすべて通過。

**変更ファイル（主なもの）:**
- 新規: `src/lib/api-request.ts` `jst.ts` `roles.ts` `session-user.ts` `shift-time-range.ts` `shift-slot-writer.ts` `staff-account-input.ts` `cast-periods.ts` `login-attempts.ts` ＋ テスト 3 本
- `src/app/api/*`（shifts / requests / casts / staff-accounts / stores / adjustments / form-import / sync）
- `src/lib/auth.ts` `ensure-shift-period.ts` `period-utils.ts` `sheet-sync.ts` `google-sheets.ts` `cast-duplicate-query.ts` `trial-guest-user.ts`
- 画面・部品ほぼ全て、`Dockerfile` `package.json` `docs/STAGING.md` `docs/*_MANUAL.md`

**確かめたこと:** `tsc --noEmit` ○ / `eslint` ○（0 件）/ `npm test` ○（7 本 95 件）/ `npm run build` ○
**確かめていないこと:** ブラウザ・実機で触っていない。DB につないだ動作確認をしていない。

**メモ（デプロイ前に必要）:**
- スキーマ変更は無いので `prisma migrate deploy` は不要
- 既存データに残っている「シフト表から自動生成された希望」は見分けが付かないため、そのまま残る。未提出一覧が実態と合うのは、この修正以降に追加した分から
- `.backup` `.backup2` `dev.db` の 6 ファイルは未削除（git 管理外で戻せないため、判断を仰ぐ）

**Git:** 未コミット
