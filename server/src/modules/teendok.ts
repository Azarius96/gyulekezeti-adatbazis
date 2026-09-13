import { prisma } from "../lib/prisma.js";

/**
 * TÖRVÉNYBEN ELŐÍRT ÉVES TEENDŐK
 * ================================
 * A Romániai Református Egyház törvénytára (37-39. §. és a presbitérium/lelkipásztor
 * hatásköréről szóló szakaszok) alapján - a katalógus maga kódban van (nem szerkeszthető a
 * felületen), mert ezek nem tetszőleges emlékeztetők, hanem konkrét Kánon-hivatkozású
 * kötelezettségek. Csak azt tároljuk adatbázisban (TeendoTeljesites), hogy egy adott
 * gyülekezet egy adott évben már teljesítette-e az adott teendőt.
 */

export interface TeendoDefinition {
  id: string;
  cim: string;
  rovidLeiras: string;
  kanonHivatkozas: string;
  reszletes: string;
  /** null = nincs a Kánonban rögzített, egységes naptári határidő (pl. mert az egyházmegye
   * szabja meg, vagy mert folyamatos/év végi kötelezettség) - ilyenkor nem sürgetjük dátum
   * szerint, csak folyamatosan látható emlékeztetőként szerepel. */
  hatarido: { honap: number; nap: number } | null;
  /** Ennyi nappal a határidő előtt kezdjük "hamarosan esedékes"-ként mutatni. */
  leadNapok: number;
  link?: string;
}

export const TEENDO_KATALOGUS: TeendoDefinition[] = [
  {
    id: "valasztoi-nevjegyzek",
    cim: "Választói névjegyzék elkészítése",
    rovidLeiras:
      "A presbitériumnak minden évben választói névjegyzéket kell összeállítania, közszemlére tennie, majd az esperesi hivatalhoz felterjesztenie.",
    kanonHivatkozas: "A Romániai Református Egyház törvénytára, 37-39. §.",
    reszletes: [
      "Jogosultak köre (12. §. a) pont): választói jog illeti meg minden konfirmált és 18. életévét betöltött egyháztagot, aki részt vesz az egyházi köztehervi­selésben - azaz az előző évi december 31-ig esedékes egyházfenntartói járulékát a névjegyzék összeállításáig befizette.",
      "1. Összeállítás: a presbitérium állítja össze, a lelkészi hivatal két egyező példányban készíti el, legkésőbb május 15-ig. Mindkét példányt a lelkész és a gondnok (vagy főgondnok) írja alá.",
      "2. Közszemle: május 15-23. között a lelkészi/egyházi hivatalban közszemlére kell tenni. Eddig az időpontig lehet ellene fellebbezést (felszólamlást) benyújtani.",
      "3. Fellebbezés elbírálása: a presbitérium (vagy az erre kiküldött 5 tagú bizottsága) legkésőbb június 3-ig határoz a beérkezett fellebbezésekről.",
      "4. Felterjesztés: mindkét eredeti példányt legkésőbb június 5-ig fel kell terjeszteni az esperesi hivatalhoz.",
      "5. Esperesi fellebbezés: az espereshez legkésőbb június 20-ig lehet fellebbezést benyújtani.",
      "6. Esperesi jóváhagyás: az esperes legkésőbb június 30-ig végérvényesen határoz, és ezzel a dátummal hitelesíti mindkét példányt. Az egyiket az esperesi hivatal irattárában őrzi, a másikat visszaküldi a gyülekezetnek.",
      "Érvényesség: a hitelesített névjegyzék a hitelesítést követő július 1-től a következő év június 30-ig érvényes és jogerős.",
      "A rendszer a Háztartások/Személyek adatai alapján automatikusan összeállítja a jogosultak listáját - ezt a Választók névjegyzéke oldalon lehet ellenőrizni, szükség esetén kiegészíteni, és nyomtatható formában (aláírási sorokkal, esperesi záradékkal) letölteni.",
    ].join("\n\n"),
    hatarido: { honap: 5, nap: 15 },
    leadNapok: 45,
    link: "/valasztoi-nevjegyzek",
  },
  {
    id: "koltsegvetes-vagyonleltar",
    cim: "Éves költségvetés, számadás és vagyonleltári jelentés",
    rovidLeiras:
      "A presbitérium évente elkészíti a költségvetést és a számadást, és az egyházmegye által megszabott időpontban felterjeszti egyházmegyei felülvizsgálatra, a vagyonleltári jelentéssel együtt.",
    kanonHivatkozas: "A Romániai Református Egyház törvénytára, a presbitérium hatásköréről szóló szakasz, m) pont.",
    reszletes: [
      "A presbitérium az egyházközség költségvetését évenként elkészíti, és jóváhagyás után végrehajtja.",
      "Pénzügyi bizottságot szervez, amely az egyházközség pénzforgalmát legalább félévenként számba veszi, jegyzőkönyvezi, és az eredményről a presbitériumnak beszámol.",
      "Az egyházmegye rendelkezései szerint kitűzött időben fel kell terjeszteni egyházmegyei felülvizsgálatra a költségvetést, a számadást, valamint az évenkénti vagyonleltári jelentést.",
      "Mivel a pontos határidőt az egyházmegye szabja meg (nem egységes a Kánonban), ezt a helyi egyházmegyei gyakorlat szerint kell tisztázni - ez a teendő ezért folyamatos emlékeztetőként jelenik meg, nincs beépített naptári határidő.",
    ].join("\n\n"),
    hatarido: null,
    leadNapok: 0,
  },
  {
    id: "lelkeszi-evi-jelentes",
    cim: "Lelkészi évi jelentés",
    rovidLeiras:
      "A lelkipásztor évente jelentést készít a gyülekezet életéről és állapotáról, amelyet a presbitériummal és a közgyűléssel megtárgyal.",
    kanonHivatkozas: "A Romániai Református Egyház törvénytára, a lelkipásztor kötelességeiről szóló szakasz.",
    reszletes: [
      "A lelkipásztor a gyülekezet életéről és állapotáról rendszeresen beszámol a presbitériumnak, és évi jelentést készít.",
      "Az évi jelentést a presbitériummal és a közgyűléssel is meg kell tárgyalni - ez jellemzően az év végi/év eleji közgyűlésen történik.",
      "A Kánon nem rögzít egységes naptári határidőt erre, ezért ez a teendő folyamatos emlékeztetőként jelenik meg.",
    ].join("\n\n"),
    hatarido: null,
    leadNapok: 0,
  },
];

export interface TeendoStatus extends TeendoDefinition {
  ev: number;
  hataridoDatum: string | null;
  allapot: "lejart" | "hamarosan" | "folyamatos" | "tavoli" | "teljesitve";
  teljesitveDatuma: string | null;
}

/** "ÉÉÉÉ-HH-NN" formátumú dátum a naptári év/hónap/nap alapján - szándékosan nem
 * `Date.toISOString()`-tal, mert az UTC-re konvertálna, és UTC-nél keletebbi időzónában
 * (pl. Románia) egy nappal korábbi dátumot adna vissza. */
function ymd(year: number, month1based: number, day: number): string {
  return `${year}-${String(month1based).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function getTeendoStatusok(gyulekezetId: string): Promise<TeendoStatus[]> {
  const year = new Date().getFullYear();
  const completions = await prisma.teendoTeljesites.findMany({ where: { gyulekezetId, ev: year } });
  const now = new Date();

  return TEENDO_KATALOGUS.map((t) => {
    const completion = completions.find((c) => c.teendoId === t.id);
    let allapot: TeendoStatus["allapot"];
    let hataridoDatum: string | null = null;

    if (completion) {
      allapot = "teljesitve";
      if (t.hatarido) {
        hataridoDatum = ymd(year, t.hatarido.honap, t.hatarido.nap);
      }
    } else if (t.hatarido) {
      const deadline = new Date(year, t.hatarido.honap - 1, t.hatarido.nap);
      hataridoDatum = ymd(year, t.hatarido.honap, t.hatarido.nap);
      const daysLeft = (deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      if (daysLeft < 0) allapot = "lejart";
      else if (daysLeft <= t.leadNapok) allapot = "hamarosan";
      else allapot = "tavoli";
    } else {
      allapot = "folyamatos";
    }

    return { ...t, ev: year, hataridoDatum, allapot, teljesitveDatuma: completion ? completion.teljesitve.toISOString() : null };
  });
}

/** A harang alatt megjelenő, ténylegesen sürgető teendők - lejárt vagy hamarosan esedékes,
 * és még nincs teljesítve. A folyamatos/távoli teendők csak a teljes listán jelennek meg. */
export function filterUrgent(statusok: TeendoStatus[]): TeendoStatus[] {
  return statusok.filter((s) => s.allapot === "lejart" || s.allapot === "hamarosan");
}
