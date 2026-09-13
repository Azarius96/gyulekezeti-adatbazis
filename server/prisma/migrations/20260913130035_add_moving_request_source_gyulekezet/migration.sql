-- AlterTable
ALTER TABLE "MovingRequest" ADD COLUMN     "forrasGyulekezetId" TEXT;

-- AddForeignKey
ALTER TABLE "MovingRequest" ADD CONSTRAINT "MovingRequest_forrasGyulekezetId_fkey" FOREIGN KEY ("forrasGyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
