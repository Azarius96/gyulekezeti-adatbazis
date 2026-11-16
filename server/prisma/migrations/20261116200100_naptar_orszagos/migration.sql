-- A falinaptár 2027 ünnepei és az úrvacsorás istentiszteletek eddig gyülekezetenként külön-külön (duplán) szerepeltek: egy országos példány marad belőlük.
UPDATE "Event" SET "szint" = 'ORSZAGOS', "status" = 'JOVAHAGYVA', "gyulekezetId" = NULL, "egyhazmegyeId" = NULL, "keruletId" = NULL
WHERE "id" IN (
  SELECT DISTINCT ON ("cim", "datuma") "id" FROM "Event"
  WHERE "leiras" IN ('Erdélyi Református Falinaptár 2027', 'Úrvacsoraosztás')
  ORDER BY "cim", "datuma", "id"
);
DELETE FROM "Event" WHERE "leiras" IN ('Erdélyi Református Falinaptár 2027', 'Úrvacsoraosztás') AND "szint" <> 'ORSZAGOS';
