-- AlterTable: ShiftRequest に updatedAt カラムを追加
-- 既存行は createdAt と同じ値で初期化（過去の最終操作日時として扱う）
ALTER TABLE "ShiftRequest" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "ShiftRequest" SET "updatedAt" = "createdAt";
