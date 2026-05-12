# ステージング環境（Railway）

本番とデータ・URL・シークレットを分離し、**ステージングで確認してから本番（`main`）に載せる**ためのフローです。

参考: [Railway Environments](https://docs.railway.com/develop/environments)

## 全体像

| 項目 | 本番（production） | ステージング（staging） |
|------|-------------------|------------------------|
| ブランチ | `main` など（現状どおり） | `staging`（推奨） |
| DB | 本番用 Postgres | **別インスタンス**（必須） |
| `DATABASE_URL` | 本番 DB | ステージング DB の URL |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | 本番用の強い乱数 | **別の**乱数（本番と同じにしない） |
| `NEXT_PUBLIC_APP_URL` | 本番ドメイン | ステージングの Railway URL |
| `NEXT_PUBLIC_APP_ENV` | 未設定 or `production` | **`staging`**（画面上部にバナー表示） |
| `DISCORD_SHIFT_SUBMIT_WEBHOOK_URL` | 実運用チャンネル | **テスト用 Webhook** 推奨（本番と分ける） |

## Railway での構築手順（概略）

1. **プロジェクトを開く** → 右上の環境ドロップダウンで **New Environment** → 名前を `staging`。
2. **ステージング用 Postgres を追加**（`New` → Database → PostgreSQL）。本番の DB とは別にする。
3. **アプリサービスをステージングに用意する**（次のどちらか）。
   - **空のサービスを追加** → Source に同じ GitHub リポジトリを指定 → Root Directory / Dockerfile は本番と同じ（`railway.json` / `Dockerfile`）。
   - または本番サービスを **複製** してステージング環境に移し、接続ブランチだけ変える（プロジェクト構成による）。
4. **ステージングの Web サービス** で **Settings → Service → Source** の **Branch** を **`staging`** に設定する（`main` のままにしない）。
5. **Variables** をステージング用にすべて埋める（上表）。Postgres を同じ環境に置いた場合は **`DATABASE_URL` を「ステージング Postgres」への参照**にする（` ${{StagingPostgres.DATABASE_URL}}` 形式など Railway UI の Variable Reference を利用）。
6. 初回デプロイ後、ステージング URL にアクセスし、**画面上部にオレンジの「ステージング環境」バナー**が出ることを確認する（`NEXT_PUBLIC_APP_ENV=staging` 時）。

## 推奨 Git フロー

1. 機能開発: `feature/xxx` → **`staging` にマージ**（PR 推奨）。
2. Railway が **`staging` ブランチ**をデプロイ → ステージング URL で**網羅テスト**。
3. 問題なければ **`staging` → `main`** の PR をマージ → 本番デプロイ。

緊急パッチのみ `main` 直コミットにする場合は、あとから `staging` に **`main` をマージして追従**させると差分がずれません。

## 初回: `staging` ブランチの作り方（ローカル）

```bash
git checkout main
git pull origin main
git checkout -b staging
git push -u origin staging
```

以降、Railway のステージングサービスはこのブランチを参照します。

## 注意

- **本番 DB の URL をステージングに渡さない**（誤操作・テストデータ混入のリスク）。
- ステージングでも `prisma migrate deploy` が起動時に走るため、**マイグレーションは本番と同じ順序**で適用されます。スキーマ変更は「ステージングで先に確認 → 問題なければ本番」の順が安全です。
