import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, isStatsOnly } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";
import { Prisma } from "@prisma/client";

const KOR_SAVOK = [
  { label: "0–14 év", min: 0, max: 14 },
  { label: "15–29 év", min: 15, max: 29 },
  { label: "30–49 év", min: 30, max: 49 },
  { label: "50–69 év", min: 50, max: 69 },
  { label: "70+ év", min: 70, max: 999 },
];

/**
 * Az élő (nem elhunyt, nem kiköltözött, nem törölt) tagok statisztikája EGYETLEN adatbázis-lekérdezéssel:
 * nemek, kor szerinti sávok (év végi életkor), konfirmáló korúak (12-14 év, mai életkor), 18 év alattiak
 * és a születési dátum nélküliek. Az összesítést az adatbázis végzi (nem töltjük le a tagok sorait), ezért
 * az adatmennyiséggel alig lassul. Az életkor számítása ugyanaz, mint a korábbi (befejezett évek száma).
 */
async function eloTagokStatisztika(gyulekezetIds: string[] | undefined, currentYear: number) {
  const now = new Date();
  const ma = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const evVege = `${currentYear}-12-31`;
  const scope =
    gyulekezetIds === undefined
      ? Prisma.empty
      : gyulekezetIds.length === 0
        ? Prisma.sql`AND false`
        : Prisma.sql`AND "gyulekezetId" IN (${Prisma.join(gyulekezetIds)})`;
  const savFeltetelek = KOR_SAVOK.map(
    (b, i) => Prisma.sql`count(*) FILTER (WHERE ev_kor BETWEEN ${b.min} AND ${b.max})::int AS ${Prisma.raw(`sav${i}`)}`
  );
  const rows = await prisma.$queryRaw<Record<string, number>[]>`
    WITH t AS (
      SELECT nem, "szuletesiDatum" AS sz,
        date_part('year', age(${ma}::date, "szuletesiDatum"::date))::int AS ma_kor,
        date_part('year', age(${evVege}::date, "szuletesiDatum"::date))::int AS ev_kor
      FROM "Person"
      WHERE "deletedAt" IS NULL AND elhunyt = false AND elkoltozott = false ${scope}
    )
    SELECT
      count(*) FILTER (WHERE nem = 'FERFI')::int AS ferfiak,
      count(*) FILTER (WHERE nem = 'NO')::int AS nok,
      count(*) FILTER (WHERE sz IS NULL)::int AS ismeretlen,
      count(*) FILTER (WHERE ma_kor BETWEEN 12 AND 14)::int AS konfirmalo,
      count(*) FILTER (WHERE ma_kor < 18)::int AS fiatal,
      ${Prisma.join(savFeltetelek)}
    FROM t`;
  const r = rows[0];
  return {
    ferfiak: Number(r.ferfiak),
    nok: Number(r.nok),
    ismeretlenKor: Number(r.ismeretlen),
    konfirmaloKoruak: Number(r.konfirmalo),
    fiatalkoruak: Number(r.fiatal),
    savok: KOR_SAVOK.map((_, i) => Number(r[`sav${i}`])),
  };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/dashboard/stats", async (req, reply) => {
    const user = req.currentUser!;
    const query = (req.query as { gyulekezetId?: string; egyhazmegyeId?: string }) ?? {};
    const accessible = await getAccessibleGyulekezetIds(user);

    if (query.gyulekezetId && accessible !== "ALL" && !accessible.includes(query.gyulekezetId)) {
      return reply.code(403).send({ error: "Nincs jogosultság" });
    }

    let gyulekezetIds: string[] | undefined;
    if (query.gyulekezetId) {
      gyulekezetIds = [query.gyulekezetId];
    } else if (query.egyhazmegyeId) {
      // Egyházmegyei statisztika: az egyházmegye azon gyülekezetei, amelyeket a felhasználó láthat.
      const inMegye = await prisma.gyulekezet.findMany({ where: { egyhazmegyeId: query.egyhazmegyeId }, select: { id: true } });
      gyulekezetIds = inMegye.map((g) => g.id).filter((id) => accessible === "ALL" || accessible.includes(id));
    } else if (accessible !== "ALL") {
      gyulekezetIds = accessible;
    }

    const where = gyulekezetIds ? { gyulekezetId: { in: gyulekezetIds } } : {};

    const currentYear = new Date().getFullYear();
    // Az idei elhunytak száma a TEMETŐ adataiból jön: a folyó évben rögzített (temetési dátumú) temetések
    // száma - a kártyára kattintva a Temető oldal nyílik meg, ugyanezekkel az adatokkal.
    const [elhunytakIdenre, elkoltoztekIdenre, kor] = await Promise.all([
      prisma.burial.count({
        where: {
          person: where,
          datuma: { gte: new Date(currentYear, 0, 1), lte: new Date(currentYear, 11, 31, 23, 59, 59) },
        },
      }),
      // Az idén elköltözöttek: a gyülekezetből ténylegesen kikerült (ismeretlen célba költözött és most is kiköltözött, vagy
      // másik gyülekezetbe átadott) tagok, a költözés (kezdeményezés) dátuma szerint az idei évben.
      prisma.movingRequest.count({
        where: {
          ...(gyulekezetIds ? { forrasGyulekezetId: { in: gyulekezetIds } } : {}),
          kezdemenyezve: { gte: new Date(currentYear, 0, 1), lte: new Date(currentYear, 11, 31, 23, 59, 59) },
          OR: [{ status: "ELFOGADVA" }, { status: "ISMERETLEN_CELBA", person: { elkoltozott: true } }],
        },
      }),
      eloTagokStatisztika(gyulekezetIds, currentYear),
    ]);
    const { ferfiak, nok, ismeretlenKor, konfirmaloKoruak, fiatalkoruak } = kor;
    const osszlétszám = ferfiak + nok; // élő tagok (elhunytak és kiköltözöttek nélkül)

    // Kor szerinti megoszlás (élő tagok) - az áttekintő kördiagramjához. Az adott év végi életkor szerint
    // számol, a díjszabással (kedvezményes/mentes sávok) azonos módon, így a "70+" sáv pontosan a 70 éves
    // kori kedvezmény alá eső tagokat jelenti. A "nincs születési dátum" külön sor, hogy a sávok összege
    // mindig kiadja az összlétszámot.
    const korEloszlas = [
      ...KOR_SAVOK.map((b, i) => ({ label: b.label, count: kor.savok[i] })),
      ...(ismeretlenKor > 0 ? [{ label: "Nincs születési dátum", count: ismeretlenKor }] : []),
    ];

    const [presbiterek, gondnokok, noszovetseg] = await Promise.all([
      prisma.position.count({ where: { tisztseg: { in: ["PRESBITER", "POTPRESBITER"] }, vege: null, person: { elhunyt: false, elkoltozott: false }, ...(gyulekezetIds ? { gyulekezetId: { in: gyulekezetIds } } : {}) } }),
      prisma.position.count({ where: { tisztseg: { in: ["GONDNOK", "FOGONDNOK"] }, vege: null, person: { elhunyt: false, elkoltozott: false }, ...(gyulekezetIds ? { gyulekezetId: { in: gyulekezetIds } } : {}) } }),
      prisma.position.count({ where: { tisztseg: "NOSZOVETSEGI_TAG", vege: null, person: { elhunyt: false, elkoltozott: false }, ...(gyulekezetIds ? { gyulekezetId: { in: gyulekezetIds } } : {}) } }),
    ]);

    const gyulekezetIdEkkorFilter = gyulekezetIds ? { in: gyulekezetIds } : undefined;

    // Legutóbbi aktivitás - valós, időbélyeggel rendelkező rekordok (személyfelvétel,
    // egyházfenntartó- és adománybefizetés) összefésülve, a legfrissebbek elöl.
    const [recentPersons, recentDues, recentDonations] = await Promise.all([
      prisma.person.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, vezeteknev: true, keresztnev: true, createdAt: true },
      }),
      prisma.duesPayment.findMany({
        where: { gyulekezetIdEkkor: gyulekezetIdEkkorFilter },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, osszeg: true, createdAt: true, person: { select: { id: true, vezeteknev: true, keresztnev: true } } },
      }),
      prisma.donation.findMany({
        where: { gyulekezetIdEkkor: gyulekezetIdEkkorFilter },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, osszeg: true, createdAt: true, person: { select: { id: true, vezeteknev: true, keresztnev: true } } },
      }),
    ]);
    const legutobbiAktivitas = [
      ...recentPersons.map((p) => ({
        id: `person-${p.id}`,
        personId: p.id,
        nev: `${p.vezeteknev} ${p.keresztnev}`,
        leiras: "Új személy rögzítve",
        idopont: p.createdAt,
      })),
      ...recentDues.map((d) => ({
        id: `dues-${d.id}`,
        personId: d.person.id,
        nev: `${d.person.vezeteknev} ${d.person.keresztnev}`,
        leiras: `Egyházfenntartó rögzítve: ${Number(d.osszeg)} lej`,
        idopont: d.createdAt,
      })),
      ...recentDonations.map((d) => ({
        id: `donation-${d.id}`,
        personId: d.person.id,
        nev: `${d.person.vezeteknev} ${d.person.keresztnev}`,
        leiras: `Adomány rögzítve: ${Number(d.osszeg)} lej`,
        idopont: d.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.idopont).getTime() - new Date(a.idopont).getTime())
      .slice(0, 8);

    return {
      osszlétszám,
      elhunytakIdenre,
      elkoltoztekIdenre,
      ferfiak,
      nok,
      konfirmaloKoruak,
      fiatalkoruak,
      presbiterek,
      gondnokok,
      noszovetseg,
      korEloszlas,
      // A csak statisztikát látó (püspöki) fiók személyek nevét tartalmazó aktivitás-listát nem kap.
      legutobbiAktivitas: isStatsOnly(user) ? [] : legutobbiAktivitas,
    };
  });
}
