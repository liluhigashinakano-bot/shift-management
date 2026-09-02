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

## 現在のステージング URL

シフト管理アプリのステージング URL は次です。

```text
https://shift-management-staging.up.railway.app/login
```

`https://task-museum-staging.up.railway.app` は別アプリの URL なので、シフト管理アプリの確認には使いません。

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
- **データの作り直し（`prisma migrate deploy`）は起動時には走りません。** 列を足したときは、デプロイのあとに Railway のシェルで **手動で 1 回だけ** 実行してください。忘れると公開直後から 500 エラーになります。
- スキーマ変更は「ステージングで先に確認 → 問題なければ本番」の順が安全です。

## 例外: ステージングを本番 DB と完全に同じにする場合

通常は推奨しません。ステージング上の編集・削除・ロック操作が、そのまま本番データを変更します。

それでも一時的に本番環境と完全一致させる場合は、Railway の `staging` 環境で **Postgres サービスではなく、アプリサービス `shift-management` 側の Variables** を開き、`DATABASE_URL` を production の Postgres `DATABASE_URL` と同じ値にします。その後、`staging` のアプリサービスを redeploy/restart します。

作業後にステージング DB を分けた構成へ戻す場合は、`DATABASE_URL` を staging 用 Postgres の URL に戻して redeploy/restart します。

## ステージング管理者ログインを復旧する SQL

ステージング DB が空、または `admin@shift.local` のパスワードが分からなくなった場合にだけ使います。本番 DB では実行しません。

```sql
UPDATE "User"
SET
  "passwordHash" = '$2b$10$5gK3/Vv8aD1MEYQLnirsweRA2cGcZFmPmsnRg9yZlo75tYHAwDfLm',
  "role" = 'admin',
  "accessAllStores" = true,
  "editAllStores" = true
WHERE "email" = 'admin@shift.local';

INSERT INTO "User" (
  "id", "name", "email", "passwordHash", "role", "accessAllStores", "editAllStores", "createdAt"
)
SELECT
  'admin-shift-local',
  '管理者',
  'admin@shift.local',
  '$2b$10$5gK3/Vv8aD1MEYQLnirsweRA2cGcZFmPmsnRg9yZlo75tYHAwDfLm',
  'admin',
  true,
  true,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "User" WHERE "email" = 'admin@shift.local'
);
```

復旧後の初期ログイン:

```text
ID: admin@shift.local
PASS: admin123
```

## ステージングにダミーデータを投入する

店舗・社員・キャスト・現在表示対象のシフト期間・サンプルシフトをまとめて作る SQL は次に置いています。

```text
scripts/staging-dummy-data.sql
```

Railway の `staging` 環境で Postgres > Database > Query を開き、この SQL を丸ごと貼り付けて実行します。実行後にステージングのダッシュボードを再読み込みしてください。

## Prisma migrate が失敗したとき（P3009 / P3018）

**ステージングで一度だけ失敗した**場合、`"_prisma_migrations"` に **failed** な記録が残り、以降すべて拒否されます。いずれかで解消してください。

1. **空の検証 DB なら**（データ不要）: Railway の Postgres を**新規作成し直す**か、変数の `DATABASE_URL` を新しい DB に差し替えてから再デプロイするのが最も簡単です。
2. **中身を残したい**場合: `psql` や Railway の SQL コンソールで以下を確認し、[Prisma の公式手順](https://www.prisma.io/docs/guides/migrate/production-troubleshooting)に沿って `migrate resolve` などで整合を取ります。

`User` が無いのに `ALTER TABLE "User"` だけが走るエラーは、**マイグレーション名の辞書順**が `init` より前になっていたことが原因でした。リポジトリでは `isTrialGuest` 用フォルダを **`20260413160721_init` の直後**になるよう整えています。

### 本番 DB に古いフォルダ名だけが記録されている場合

以前の名前 `20260202120000_user_is_trial_guest` で **すでに適用済み**の本番だけ、`_prisma_migrations` の行を新しい名前に合わせます（`migration.sql` の中身は同じなので checksum はそのまま通常問題になりません）。

```sql
UPDATE "_prisma_migrations"
SET migration_name = '20260413160800_user_is_trial_guest'
WHERE migration_name = '20260202120000_user_is_trial_guest';
```

未適用の環境ではこの SQL は不要です。デプロイ後に `prisma migrate deploy` が通ることを確認してください。
