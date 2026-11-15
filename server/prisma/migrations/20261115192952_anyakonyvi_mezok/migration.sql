-- AlterTable
ALTER TABLE "Baptism" ADD COLUMN     "allamiAnyakonyviSzam" TEXT,
ADD COLUMN     "anyakonyviEv" INTEGER,
ADD COLUMN     "anyakonyviSzam" TEXT,
ADD COLUMN     "csaladkonyviSzam" TEXT,
ADD COLUMN     "jegyzet" TEXT,
ADD COLUMN     "lapszam" TEXT,
ADD COLUMN     "szuloAnyaNev" TEXT,
ADD COLUMN     "szuloApaNev" TEXT,
ADD COLUMN     "szulokFoglalkozasa" TEXT,
ADD COLUMN     "szulokLakhelye" TEXT,
ADD COLUMN     "szulokVallasa" TEXT,
ADD COLUMN     "torvenyes" TEXT;

-- AlterTable
ALTER TABLE "Burial" ADD COLUMN     "csaladkonyviSzam" TEXT,
ADD COLUMN     "halalOka" TEXT,
ADD COLUMN     "jegyzet" TEXT,
ADD COLUMN     "lakhely" TEXT,
ADD COLUMN     "lapszam" TEXT,
ADD COLUMN     "lelkeszNeve" TEXT,
ADD COLUMN     "sorszam" TEXT,
ADD COLUMN     "szuloHazastarsNeve" TEXT;

-- AlterTable
ALTER TABLE "Confirmation" ADD COLUMN     "anyakonyviSzam" TEXT,
ADD COLUMN     "iskolaiVegzettseg" TEXT,
ADD COLUMN     "jegyzet" TEXT,
ADD COLUMN     "keresztelesHelyeIdeje" TEXT,
ADD COLUMN     "lakcim" TEXT,
ADD COLUMN     "lapszam" TEXT,
ADD COLUMN     "szuloAnyaNev" TEXT,
ADD COLUMN     "szuloApaNev" TEXT,
ADD COLUMN     "szulokFoglalkozasa" TEXT,
ADD COLUMN     "szulokVallasa" TEXT;

-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "csaladkonyviHivatkozas" TEXT,
ADD COLUMN     "csaladkonyviSzam" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "foglalkozas" TEXT;
