/*
  Warnings:

  - You are about to drop the column `egyhazmegyeId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `gyulekezetId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `keruletId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `szerepKor` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_egyhazmegyeId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_gyulekezetId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_keruletId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "egyhazmegyeId",
DROP COLUMN "gyulekezetId",
DROP COLUMN "keruletId",
DROP COLUMN "szerepKor";

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "szerepKor" "SzerepKor" NOT NULL,
    "keruletId" TEXT,
    "egyhazmegyeId" TEXT,
    "gyulekezetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_szerepKor_gyulekezetId_egyhazmegyeId_kerule_key" ON "UserRole"("userId", "szerepKor", "gyulekezetId", "egyhazmegyeId", "keruletId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_keruletId_fkey" FOREIGN KEY ("keruletId") REFERENCES "Kerulet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_egyhazmegyeId_fkey" FOREIGN KEY ("egyhazmegyeId") REFERENCES "Egyhazmegye"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
