-- AlterTable
ALTER TABLE "Burial" ADD COLUMN     "cemeteryId" TEXT,
ALTER COLUMN "sirhelyId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "elkoltozott" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Burial" ADD CONSTRAINT "Burial_cemeteryId_fkey" FOREIGN KEY ("cemeteryId") REFERENCES "Cemetery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
