-- AlterTable
ALTER TABLE "User" ADD COLUMN "staffLoginId" TEXT;
ALTER TABLE "User" ADD COLUMN "accessAllStores" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_staffLoginId_key" ON "User"("staffLoginId");

-- CreateTable
CREATE TABLE "UserStoreAssignment" (
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "UserStoreAssignment_pkey" PRIMARY KEY ("userId","storeId"),
    CONSTRAINT "UserStoreAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserStoreAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
