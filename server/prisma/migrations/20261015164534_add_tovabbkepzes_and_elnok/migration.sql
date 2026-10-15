-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lelkeszertekezletiElnok" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Tovabbkepzes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "megnevezes" TEXT NOT NULL,
    "kredit" INTEGER NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "megjegyzes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tovabbkepzes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tovabbkepzes_userId_deletedAt_idx" ON "Tovabbkepzes"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Tovabbkepzes" ADD CONSTRAINT "Tovabbkepzes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
