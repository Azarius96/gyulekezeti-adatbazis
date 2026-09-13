/*
  Warnings:

  - You are about to drop the column `tipus` on the `DuesPayment` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CsaladiAllapot" AS ENUM ('NOTLEN_HAJADON', 'HAZAS', 'OZVEGY', 'ELVALT');

-- DropForeignKey
ALTER TABLE "Marriage" DROP CONSTRAINT "Marriage_spouseBId_fkey";

-- DropIndex
DROP INDEX "Marriage_spouseAId_spouseBId_datuma_key";

-- AlterTable
ALTER TABLE "DuesPayment" DROP COLUMN "tipus";

-- AlterTable
ALTER TABLE "Marriage" ADD COLUMN     "kulsoHazastarsNeve" TEXT,
ALTER COLUMN "spouseBId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "csaladiAllapot" "CsaladiAllapot";

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ev" INTEGER NOT NULL,
    "osszeg" DECIMAL(65,30) NOT NULL,
    "celja" TEXT,
    "fizetesDatuma" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gyulekezetIdEkkor" TEXT NOT NULL,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Marriage" ADD CONSTRAINT "Marriage_spouseBId_fkey" FOREIGN KEY ("spouseBId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
