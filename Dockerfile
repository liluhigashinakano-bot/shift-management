# Prisma 7 は Node 20.19+ / 22.12+ / 24+ が必須のため固定
FROM node:22.12.0-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

RUN npm run build

# 起動ではデータの作り直し（prisma migrate deploy）を走らせない。
# 起動のたびに走ると、失敗したときに再起動を繰り返してヘルスチェックが通らなくなるため
# 2026-05-22 に切り離した。
#
# ⚠️ 列を足したときは、デプロイのあとに Railway のシェルで手動で 1 回だけ実行する:
#      npx prisma migrate deploy
#    忘れると、公開直後から 500 エラーになる。
CMD ["sh", "-c", "exec npx next start --hostname 0.0.0.0 --port ${PORT:-3000}"]
