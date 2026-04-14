-- AlterTable
ALTER TABLE "User" ADD COLUMN "posId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_posId_key" ON "User"("posId");
