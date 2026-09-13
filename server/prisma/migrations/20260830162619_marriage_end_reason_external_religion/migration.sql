-- CreateEnum
CREATE TYPE "MarriageVegeOka" AS ENUM ('HALALOZAS', 'VALAS');

-- AlterTable
ALTER TABLE "Donation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DuesPayment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Marriage" ADD COLUMN     "kulsoHazastarsVallasa" TEXT,
ADD COLUMN     "vegeOka" "MarriageVegeOka";
