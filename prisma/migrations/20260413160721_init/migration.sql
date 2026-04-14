-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'cast',
    "hourlyRate" INTEGER,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "half" TEXT NOT NULL,
    "targetBudgetTotal" INTEGER,
    "sheetName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftPeriod_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "targetBudget" INTEGER,
    "eventName" TEXT,
    "expectedVisitors" TEXT,
    "notes" TEXT,
    "employeeOnDuty" TEXT,
    CONSTRAINT "ShiftDay_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ShiftPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "timeSlot" REAL NOT NULL,
    "castId" TEXT NOT NULL,
    "isStart" BOOLEAN NOT NULL DEFAULT false,
    "isEnd" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    CONSTRAINT "ShiftSlot_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ShiftDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftSlot_castId_fkey" FOREIGN KEY ("castId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "castId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftRequest_castId_fkey" FOREIGN KEY ("castId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShiftRequest_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ShiftPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "castId" TEXT NOT NULL,
    "originalStart" REAL NOT NULL,
    "originalEnd" REAL NOT NULL,
    "adjustedStart" REAL,
    "adjustedEnd" REAL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftAdjustment_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ShiftDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftAdjustment_castId_fkey" FOREIGN KEY ("castId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_name_key" ON "Store"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPeriod_storeId_year_month_half_key" ON "ShiftPeriod"("storeId", "year", "month", "half");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDay_periodId_date_key" ON "ShiftDay"("periodId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftSlot_dayId_timeSlot_castId_key" ON "ShiftSlot"("dayId", "timeSlot", "castId");
