-- Temető modul: opcionális telekkönyvi adatok a Cemetery-hez, "lezárt" sírhely jelölés,
-- egyediség parcella/sírhely jelzésre, és a GravePriceConfig évesítése (ervenyesTol -> ervenyesEttolEv),
-- ugyanúgy, ahogy az egyházfenntartói díjszabásnál történt.

ALTER TABLE "Cemetery" ADD COLUMN "cim" TEXT;
ALTER TABLE "Cemetery" ADD COLUMN "telekkonyvSzam" TEXT;
ALTER TABLE "Cemetery" ADD COLUMN "helyrajziSzam" TEXT;
ALTER TABLE "Cemetery" ADD COLUMN "teruletNm" INTEGER;

ALTER TABLE "Sirhely" ADD COLUMN "lezart" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Parcella_cemeteryId_jelzes_key" ON "Parcella"("cemeteryId", "jelzes");
CREATE UNIQUE INDEX "Sirhely_parcellaId_jelzes_key" ON "Sirhely"("parcellaId", "jelzes");

ALTER TABLE "GravePriceConfig" ADD COLUMN "ervenyesEttolEv" INTEGER;
UPDATE "GravePriceConfig" SET "ervenyesEttolEv" = EXTRACT(YEAR FROM "ervenyesTol")::int;
ALTER TABLE "GravePriceConfig" ALTER COLUMN "ervenyesEttolEv" SET NOT NULL;
ALTER TABLE "GravePriceConfig" DROP COLUMN "ervenyesTol";
