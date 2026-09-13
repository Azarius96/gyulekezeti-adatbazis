-- CreateTable
CREATE TABLE "TeendoTeljesites" (
    "id" TEXT NOT NULL,
    "gyulekezetId" TEXT NOT NULL,
    "teendoId" TEXT NOT NULL,
    "ev" INTEGER NOT NULL,
    "teljesitve" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeendoTeljesites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeendoTeljesites_gyulekezetId_teendoId_ev_key" ON "TeendoTeljesites"("gyulekezetId", "teendoId", "ev");

-- AddForeignKey
ALTER TABLE "TeendoTeljesites" ADD CONSTRAINT "TeendoTeljesites_gyulekezetId_fkey" FOREIGN KEY ("gyulekezetId") REFERENCES "Gyulekezet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
