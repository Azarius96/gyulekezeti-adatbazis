import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getAccessibleGyulekezetIds, isStatsOnly } from "../auth/scope.js";
import { requireAuth } from "../auth/plugin.js";
import { ageOn } from "../lib/age.js";

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
    // Csak a folyó évben elhunytak száma - az áttekintő mindig csak az adott évi
    // elhalálozásokat mutatja (a teljes, minden korábbi évet összesítő szám a
    // Háztartások "Elhunytak" szűrőjén keresztül továbbra is elérhető).
    const [elhunytakIdenre, ferfiak, nok, eloTagok] = await Promise.all([
      prisma.person.count({
        where: { ...where, elhunyt: true, elhunytDatuma: { gte: new Date(currentYear, 0, 1), lte: new Date(currentYear, 11, 31, 23, 59, 59) } },
      }),
      prisma.person.count({ where: { ...where, nem: "FERFI", elhunyt: false } }),
      prisma.person.count({ where: { ...where, nem: "NO", elhunyt: false } }),
      prisma.person.findMany({
        where: { ...where, elhunyt: false, szuletesiDatum: { not: null } },
        select: { szuletesiDatum: true },
      }),
    ]);
    const osszlétszám = ferfiak + nok; // élő tagok (elhunytak nélkül)

    const now = new Date();
    let konfirmaloKoruak = 0;
    let fiatalkoruak = 0;

    // Kor szerinti megoszlás (élő tagok) - az áttekintő kördiagramjához.
    const korBuckets = [
      { label: "0–14 év", min: 0, max: 14, count: 0 },
      { label: "15–29 év", min: 15, max: 29, count: 0 },
      { label: "30–49 év", min: 30, max: 49, count: 0 },
      { label: "50–69 év", min: 50, max: 69, count: 0 },
      { label: "70+ év", min: 70, max: 999, count: 0 },
    ];
    for (const p of eloTagok) {
      if (!p.szuletesiDatum) continue;
      const age = ageOn(p.szuletesiDatum, now);
      if (age >= 12 && age <= 14) konfirmaloKoruak++;
      if (age < 18) fiatalkoruak++;
      const bucket = korBuckets.find((b) => age >= b.min && age <= b.max);
      if (bucket) bucket.count++;
    }
    const korEloszlas = korBuckets.map((b) => ({ label: b.label, count: b.count }));

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
