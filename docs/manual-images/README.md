# 利用マニュアル用スクリーンショット

画像は `USER_MANUAL.md` から `manual-images/ファイル名` として参照されています。

## キャスト向け（`CAST_MANUAL.md` 用）

| ファイル | 内容の目安 |
|----------|------------|
| `cast-01-requests.png` | 希望一覧（キャスト） |
| `cast-02-request-modal.png` | シフト希望登録モーダル |
| `cast-03-confirmed-grid.png` | 確定シフト（格子） |
| `cast-04-adjustments.png` | 調整一覧（希望と確定） |
| `cast-05-period-dropdown.png` | 期間プルダウン |
| `cast-06-send-list-modal.png` | 送付用一覧（コピー） |

任意: `cast-00-login.png` を置けば、`CAST_MANUAL.md` の §1 に画像を追加できます。

---

## 現在あるファイル（共通・管理者向けなど）

| ファイル | 内容の目安 |
|----------|------------|
| `02-dashboard.png` | ダッシュボード（店舗カード一覧） |
| `02b-dashboard-period.png` | 期間プルダウンを開いた状態 |
| `03-shift-grid.png` | シフト表 |
| `04-day-info-modal.png` | 日別情報モーダル |
| `05-requests.png` | 希望一覧 |
| `06-adjustments.png` | 調整一覧 |
| `07-confirmed.png` | 確定シフト |
| `08-cast-list.png` | 在籍キャスト一覧 |
| `09-cast-edit-modal.png` | キャスト編集モーダル |
| `10-cast-pw-reissue-confirm.png` | パスワード再発行の確認ダイアログ |
| `11-cast-delete-confirm.png` | 削除確認ダイアログ |
| `12-cast-add-modal.png` | キャスト追加モーダル |
| `13-store-list.png` | 店舗管理一覧 |
| `14-cast-add-from-shift.png` | シフト表から開いたキャスト追加 |

## 未配置（任意）

| ファイル | 用途 |
|----------|------|
| `01-login.png` | ログイン画面（マニュアル §3 用） |

差し替えは**同じファイル名で上書き**すれば反映されます。

## PDF

マニュアルを更新したあと PDF も更新する場合:

```bash
npm run docs:pdf
```

出力: `docs/USER_MANUAL.pdf`（Windows では **Google Chrome** の headless を利用します）。

キャスト向け:

```bash
npm run docs:pdf:cast
```

出力: `docs/CAST_MANUAL.pdf`
