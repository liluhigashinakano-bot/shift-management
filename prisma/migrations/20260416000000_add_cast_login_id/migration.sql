-- AlterTable
ALTER TABLE "User" ADD COLUMN "castLoginId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_castLoginId_key" ON "User"("castLoginId");
