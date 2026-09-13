-- ChurchDuesConfig: ervenyesTol (dátum) -> ervenyesEttolEv (év), a nem használt
-- ervenyesIg oszlop és a soha be nem vezetett DuesDiscount tábla eltávolítása.

ALTER TABLE "ChurchDuesConfig" ADD COLUMN "ervenyesEttolEv" INTEGER;

UPDATE "ChurchDuesConfig" SET "ervenyesEttolEv" = EXTRACT(YEAR FROM "ervenyesTol")::int;

ALTER TABLE "ChurchDuesConfig" ALTER COLUMN "ervenyesEttolEv" SET NOT NULL;

ALTER TABLE "ChurchDuesConfig" DROP COLUMN "ervenyesTol";
ALTER TABLE "ChurchDuesConfig" DROP COLUMN "ervenyesIg";

DROP TABLE "DuesDiscount";
