import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { burialHelye, type PersonDetail } from "../lib/types";
import { DateInput } from "../components/DateInput";
import { IconChevronDown, IconChevronRight } from "../components/icons";
import { age as computeAge } from "../lib/age";

type Tipus =
  | "kereszteles"
  | "konfirmacio"
  | "hazassag"
  | "egyhaztagsag"
  | "temetes"
  | "atiratkozas"
  | "visszairatkozas"
  | "kiiratkozas"
  | "allampolgarsag"
  | "ajanlolevel";
type Nyelv = "hu" | "ro" | "en";

const NYILATKOZAT_TIPUSOK: Tipus[] = ["kiiratkozas", "visszairatkozas"];

interface GyulekezetFejlec {
  id: string;
  nev: string;
  publicAddress: string | null;
  publicContact: string | null;
  codFiscal: string | null;
  romanCim: string | null;
  postaiCim: string | null;
  lelkeszNev: string;
}

const HONAPOK: Record<Nyelv, string[]> = {
  hu: ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"],
  ro: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

function fmtDate(iso: string | null | undefined, nyelv: Nyelv): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const honap = HONAPOK[nyelv][m - 1];
  if (nyelv === "hu") return `${y}. ${honap} ${d}.`;
  if (nyelv === "ro") return `${d} ${honap} ${y}`;
  return `${honap} ${d}, ${y}`;
}


const ES: Record<Nyelv, string> = { hu: " és ", ro: " și ", en: " and " };
const EV_SUFFIX: Record<Nyelv, (n: number) => string> = {
  hu: (n) => `${n} év`,
  ro: (n) => `${n} ani`,
  en: (n) => `${n} years`,
};

const TIPUS_LABEL: Record<Tipus, string> = {
  kereszteles: "Keresztelési igazolás",
  konfirmacio: "Konfirmációi igazolás",
  hazassag: "Házasságkötési igazolás",
  egyhaztagsag: "Egyháztagsági igazolás",
  temetes: "Temetési igazolás",
  atiratkozas: "Átiratkozó irat",
  visszairatkozas: "Visszairatkozási kérelem",
  kiiratkozas: "Kiiratkozási nyilatkozat",
  allampolgarsag: "Állampolgársági igazolás",
  ajanlolevel: "Ajánlólevél",
};

// A Tárgy (fejléc jobb felső sarka) rövid, ügykör-jellegű szó - a konkrét okot (pl. "iskolába
// beiratkozás") a Cél mező adja, ami a záró bekezdésben jelenik meg.
const TARGY_ALAP: Record<Nyelv, Record<Tipus, string>> = {
  hu: {
    kereszteles: "KERESZTELÉS", konfirmacio: "KONFIRMÁCIÓ", hazassag: "HÁZASSÁGKÖTÉS", egyhaztagsag: "EGYHÁZTAGSÁG",
    temetes: "TEMETÉS", atiratkozas: "ÁTIRATKOZÁS", visszairatkozas: "VISSZAIRATKOZÁS", kiiratkozas: "KIIRATKOZÁS",
    allampolgarsag: "ÁLLAMPOLGÁRSÁG", ajanlolevel: "LELKIPÁSZTORI AJÁNLÁS",
  },
  ro: {
    kereszteles: "BOTEZ", konfirmacio: "CONFIRMARE", hazassag: "CĂSĂTORIE", egyhaztagsag: "APARTENENȚĂ",
    temetes: "ÎNMORMÂNTARE", atiratkozas: "TRANSFER", visszairatkozas: "REPRIMIRE", kiiratkozas: "RETRAGERE",
    allampolgarsag: "CETĂȚENIE", ajanlolevel: "RECOMANDARE",
  },
  en: {
    kereszteles: "BAPTISM", konfirmacio: "CONFIRMATION", hazassag: "MARRIAGE", egyhaztagsag: "MEMBERSHIP",
    temetes: "FUNERAL", atiratkozas: "TRANSFER", visszairatkozas: "READMISSION", kiiratkozas: "WITHDRAWAL",
    allampolgarsag: "CITIZENSHIP", ajanlolevel: "RECOMMENDATION",
  },
};

// A dokumentum középre igazított, félkövér főcíme - típus- és nyelvfüggő.
const TIPUS_CIM: Record<Nyelv, Record<Tipus, string>> = {
  hu: {
    kereszteles: "KERESZTELÉSI IGAZOLÁS", konfirmacio: "KONFIRMÁCIÓI IGAZOLÁS", hazassag: "HÁZASSÁGKÖTÉSI IGAZOLÁS",
    egyhaztagsag: "EGYHÁZTAGSÁGI IGAZOLÁS", temetes: "TEMETÉSI IGAZOLÁS", atiratkozas: "ÁTIRATKOZÓ IRAT",
    visszairatkozas: "VISSZAIRATKOZÁSI KÉRELEM", kiiratkozas: "KIIRATKOZÁSI NYILATKOZAT",
    allampolgarsag: "ÁLLAMPOLGÁRSÁGI IGAZOLÁS", ajanlolevel: "AJÁNLÓLEVÉL",
  },
  ro: {
    kereszteles: "ADEVERINȚĂ DE BOTEZ", konfirmacio: "ADEVERINȚĂ DE CONFIRMARE", hazassag: "ADEVERINȚĂ DE CĂSĂTORIE",
    egyhaztagsag: "ADEVERINȚĂ DE APARTENENȚĂ", temetes: "ADEVERINȚĂ DE ÎNMORMÂNTARE", atiratkozas: "ACT DE TRANSFER",
    visszairatkozas: "CERERE DE REPRIMIRE", kiiratkozas: "DECLARAȚIE DE RETRAGERE",
    allampolgarsag: "ADEVERINȚĂ PENTRU CETĂȚENIE", ajanlolevel: "SCRISOARE DE RECOMANDARE",
  },
  en: {
    kereszteles: "CERTIFICATE OF BAPTISM", konfirmacio: "CERTIFICATE OF CONFIRMATION", hazassag: "CERTIFICATE OF MARRIAGE",
    egyhaztagsag: "CERTIFICATE OF CHURCH MEMBERSHIP", temetes: "CERTIFICATE OF FUNERAL", atiratkozas: "TRANSFER DOCUMENT",
    visszairatkozas: "READMISSION REQUEST", kiiratkozas: "WITHDRAWAL DECLARATION",
    allampolgarsag: "CITIZENSHIP CERTIFICATE", ajanlolevel: "LETTER OF RECOMMENDATION",
  },
};

const ALDAS: Record<Nyelv, { normal: string; temetes: string }> = {
  hu: {
    normal: "Isten áldása kísérje életét!",
    temetes: "Nyugodjék békességben, emléke legyen áldott!",
  },
  ro: {
    normal: "Binecuvântarea lui Dumnezeu să îl/o însoțească!",
    temetes: "Odihnească-se în pace, memoria sa să fie binecuvântată!",
  },
  en: {
    normal: "May God's blessing accompany them.",
    temetes: "May they rest in peace; their memory be blessed.",
  },
};

function celMondat(nyelv: Nyelv, cel: string, kero?: string): string {
  if (nyelv === "hu") return `Jelen iratot ${kero ?? "a fent nevezett"} kérésére állítottuk ki${cel ? ` ${cel} céljából` : ""}.`;
  if (nyelv === "ro") return `Prezenta s-a eliberat la cererea susnumitului(ei)${cel ? `, pentru a servi la ${cel}` : ""}.`;
  return `This document was issued at the request of the above-named${cel ? `, to serve for ${cel}` : ""}.`;
}

const L: Record<Nyelv, {
  nyelvNev: string; hivatal: string; iktatoszam: string; targy: string; cel: string; cimzett: string; kelt: string;
  tisztelettel: string; lelkeszCim: string; nyomtatas: string;
  szuletett: string; cim: string; eletkor: string; szulok: string; gyermekek: string; kereszteles: string; konfirmacio: string; cuiLabel: string;
  alulirott: string; szul: string; lakcim: string; alairas: string; egyhazfenntarto: string; rendbenFizetve: string; hianyzik: string;
}> = {
  hu: {
    nyelvNev: "Magyar", hivatal: "Lelkészi Hivatala", iktatoszam: "Ikt. szám", targy: "Tárgy", cel: "Cél", cimzett: "Címzett", kelt: "Kelt",
    tisztelettel: "Tisztelettel,", lelkeszCim: "lelkipásztor", nyomtatas: "Nyomtatás / PDF mentés",
    szuletett: "Született", cim: "Cím", eletkor: "Jelenlegi életkor", szulok: "Szülők", gyermekek: "Gyermekek",
    kereszteles: "Keresztelés", konfirmacio: "Konfirmáció", cuiLabel: "Adószám (C.U.I.)",
    alulirott: "Alulírott:", szul: "szül.", lakcim: "lakcím", alairas: "aláírás",
    egyhazfenntarto: "Egyházfenntartó", rendbenFizetve: "rendben fizetve", hianyzik: "hiányzik",
  },
  ro: {
    nyelvNev: "Română", hivatal: "Oficiul Parohial Reformat", iktatoszam: "Nr. înreg.", targy: "Subiect", cel: "Scop", cimzett: "Destinatar", kelt: "Întocmit la",
    tisztelettel: "Cu respect,", lelkeszCim: "preot paroh", nyomtatas: "Tipărire / Salvare PDF",
    szuletett: "Născut(ă)", cim: "Adresă", eletkor: "Vârsta actuală", szulok: "Părinți", gyermekek: "Copii",
    kereszteles: "Botez", konfirmacio: "Confirmare", cuiLabel: "C.U.I.",
    alulirott: "Subsemnatul(a):", szul: "n.", lakcim: "adresa", alairas: "semnătura",
    egyhazfenntarto: "Contribuția de întreținere", rendbenFizetve: "achitată la zi", hianyzik: "restanță",
  },
  en: {
    nyelvNev: "English", hivatal: "Pastoral Office", iktatoszam: "Reg. No.", targy: "Subject", cel: "Purpose", cimzett: "Addressed to", kelt: "Issued at",
    tisztelettel: "Sincerely,", lelkeszCim: "minister", nyomtatas: "Print / Save as PDF",
    szuletett: "Born", cim: "Address", eletkor: "Current age", szulok: "Parents", gyermekek: "Children",
    kereszteles: "Baptism", konfirmacio: "Confirmation", cuiLabel: "Tax ID (C.U.I.)",
    alulirott: "The undersigned:", szul: "b.", lakcim: "address", alairas: "signature",
    egyhazfenntarto: "Membership dues", rendbenFizetve: "paid up to date", hianyzik: "outstanding",
  },
};

/** A gyülekezet nevének/településének nyelvfüggő alakja - románul a `romanCim` mező első
 * (vessző előtti) szakaszát használjuk település névként, ha az meg van adva. Enélkül a
 * dokumentum a magyar nevet mutatná románul is (pl. "Búzásbocsárd" "Bucerdea Grânoasă" helyett). */
function roTelepules(g: GyulekezetFejlec): string {
  return g.romanCim ? g.romanCim.split(",")[0].trim() : "";
}

function gyulekezetNevNyelv(g: GyulekezetFejlec, nyelv: Nyelv): string {
  if (nyelv === "ro") {
    const telepules = roTelepules(g);
    return telepules ? `Parohia Reformată ${telepules}` : g.nev;
  }
  return g.nev;
}

interface Ctx {
  nev: string;
  szuletesiDatum: (nv: Nyelv) => string;
  szuletesiHely: string;
  szuloNevek: (nv: Nyelv) => string;
  gyermekNevek: string;
  gyulekezetNev: (nv: Nyelv) => string;
  keresztelesDatum: (nv: Nyelv) => string;
  keresztelesHelye: string;
  konfirmacioDatum: (nv: Nyelv) => string;
  konfirmacioHelye: string;
  hazassagDatum: (nv: Nyelv) => string;
  hazassagHelye: string;
  hazastarsNev: string;
  cim: string;
  tagsagRendben: boolean;
  elhalalozasDatum: (nv: Nyelv) => string;
  temetesDatum: (nv: Nyelv) => string;
  temetoNev: string;
}

/** Egyetlen, minden igazolástípusra jó, semleges nyitómondat - a korábbi, típusonként (és
 * nyelvenként) külön megfogalmazott mondatok helyett. A típus-specifikus tényeket (keresztelés,
 * konfirmáció, házasság, temetés dátuma/helye stb.) már úgyis megmutatja az Alapadatok táblázat,
 * a Tárgy pedig jelzi, miről szól az irat - ez a mondat csak egy biztonságos, mindig igaz
 * kiindulópont, amit a felhasználó a konkrét esetre szabva szabadon kiegészít. */
function altalanosSzoveg(nyelv: Nyelv, ctx: Ctx, anyakonyviSzam: string): string {
  if (nyelv === "hu") {
    const bevezeto = anyakonyviSzam ? `Anyakönyvünk ${anyakonyviSzam}-as bejegyzése alapján igazolom` : "Ezennel igazolom";
    return `${bevezeto}, hogy ${ctx.nev}, aki ${ctx.szuletesiDatum("hu")}-án született, gyülekezetünk nyilvántartásában szerepel.`;
  }
  if (nyelv === "ro") {
    const bevezeto = anyakonyviSzam ? `Pe baza înregistrării nr. ${anyakonyviSzam} din registrul nostru, se adeverește` : "Prin prezenta se adeverește";
    return `${bevezeto} că ${ctx.nev}, născut(ă) la data de ${ctx.szuletesiDatum("ro")}, figurează în evidențele parohiei noastre.`;
  }
  const bevezeto = anyakonyviSzam ? `Based on entry no. ${anyakonyviSzam} in our register, this is to certify` : "This is to certify";
  return `${bevezeto} that ${ctx.nev}, born on ${ctx.szuletesiDatum("en")}, is recorded in the registers of our congregation.`;
}

/** A kiiratkozási/visszairatkozási nyilatkozat első személyű, a nyilatkozó saját szavaival
 * megfogalmazott szövege - ezért nem a `bekezdesek()` (lelkész által kiállított igazolások)
 * mintáját követi, hanem az "Alulírott ... kérem ..." formát, ahogy a valódi nyomtatványok is. */
function nyilatkozatSzoveg(tipus: "kiiratkozas" | "visszairatkozas", nyelv: Nyelv, ctx: Ctx, indoklas: string): string[] {
  if (tipus === "kiiratkozas") {
    if (nyelv === "hu")
      return [
        `Tisztelettel kérem a ${ctx.gyulekezetNev("hu")} nyilvántartásából való kiírásomat.${indoklas ? ` Kiiratkozásom oka: ${indoklas}.` : ""}`,
        `Tudatában vagyok annak, hogy ez által a ${ctx.gyulekezetNev("hu")} egyházközségben minden jogom érvényét veszíti.`,
      ];
    if (nyelv === "ro")
      return [
        `Vă rog respectuos să dispuneți retragerea mea din evidența ${ctx.gyulekezetNev("ro")}.${indoklas ? ` Motivul retragerii: ${indoklas}.` : ""}`,
        `Sunt conștient(ă) că prin aceasta îmi pierd toate drepturile în cadrul parohiei.`,
      ];
    return [
      `I respectfully request my withdrawal from the register of ${ctx.gyulekezetNev("en")}.${indoklas ? ` Reason for withdrawal: ${indoklas}.` : ""}`,
      `I am aware that by doing so I forfeit all my rights within the congregation.`,
    ];
  }
  // visszairatkozas
  if (nyelv === "hu")
    return [
      `Alulírott korábban gyülekezetünk tagja voltam.${indoklas ? ` ${indoklas}` : ""}`,
      `Fenti döntésemet átgondoltam és megbántam, ezért tisztelettel kérem a ${ctx.gyulekezetNev("hu")} közösségébe való visszafogadásomat.`,
    ];
  if (nyelv === "ro")
    return [
      `Subsemnatul(a) am fost anterior membru al parohiei noastre.${indoklas ? ` ${indoklas}` : ""}`,
      `Am regretat decizia luată și vă rog respectuos să dispuneți reprimirea mea în comunitatea ${ctx.gyulekezetNev("ro")}.`,
    ];
  return [
    `The undersigned was previously a member of our congregation.${indoklas ? ` ${indoklas}` : ""}`,
    `Having reconsidered that decision, I respectfully request to be readmitted into the community of ${ctx.gyulekezetNev("en")}.`,
  ];
}

function AdatSor({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: "2px 12px 2px 0", fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ padding: "2px 0" }}>{value || "—"}</td>
    </tr>
  );
}

interface Tenyek {
  keresztDatum: string;
  keresztHely: string;
  konfDatum: string;
  konfHely: string;
  hazassagDatum: string;
  hazassagHelye: string;
  hazastarsNev: string;
  elhalalozasDatum: string;
  temetesDatum: string;
  temetoNev: string;
}

function buildCtx(person: PersonDetail, gyulekezet: GyulekezetFejlec, t: Tenyek): Ctx {
  const hm = person.householdMemberships[0];
  const cim = hm ? `${hm.household.address.telepules}, ${hm.household.address.utca} ${hm.household.address.hazszam}` : "";
  return {
    nev: `${person.vezeteknev} ${person.keresztnev}`,
    szuletesiDatum: (nv) => fmtDate(person.szuletesiDatum, nv),
    szuletesiHely: person.szuletesiHely ?? "",
    szuloNevek: (nv) => person.csalad.szulok.map((s) => `${s.vezeteknev} ${s.keresztnev}`).join(ES[nv]),
    gyermekNevek: person.csalad.gyermekek.map((g) => `${g.vezeteknev} ${g.keresztnev}`).join(", "),
    gyulekezetNev: (nv) => gyulekezetNevNyelv(gyulekezet, nv),
    keresztelesDatum: (nv) => fmtDate(t.keresztDatum, nv),
    keresztelesHelye: t.keresztHely,
    konfirmacioDatum: (nv) => fmtDate(t.konfDatum, nv),
    konfirmacioHelye: t.konfHely,
    hazassagDatum: (nv) => fmtDate(t.hazassagDatum, nv),
    hazassagHelye: t.hazassagHelye,
    hazastarsNev: t.hazastarsNev,
    cim,
    tagsagRendben: person.fizetveIdenre && !person.tobbEveElmaradt,
    elhalalozasDatum: (nv) => fmtDate(t.elhalalozasDatum, nv),
    temetesDatum: (nv) => fmtDate(t.temetesDatum, nv),
    temetoNev: t.temetoNev,
  };
}

/** Az adatokból összeállított javasolt szöveg - ez csak a kiinduló alapértelmezés a szabadon
 * szerkeszthető "Leírás szövege" mezőhöz, amit a felhasználó bármikor teljesen átírhat, hogy a
 * saját megfogalmazását, a pontos anyakönyvi hivatkozásokat stb. maga töltse ki. */
function computeDefaultLeiras(tipus: Tipus, nyelv: Nyelv, ctx: Ctx, cel: string, indoklas: string, anyakonyviSzam: string): string {
  if (NYILATKOZAT_TIPUSOK.includes(tipus)) {
    return nyilatkozatSzoveg(tipus as "kiiratkozas" | "visszairatkozas", nyelv, ctx, indoklas).join("\n\n");
  }
  // A címzett magában a fejlécben jelenik meg (lásd lejjebb), a szövegtörzs ettől függetlenül
  // mindig ugyanaz az egy általános mondat.
  return [altalanosSzoveg(nyelv, ctx, anyakonyviSzam), celMondat(nyelv, cel), ALDAS[nyelv][tipus === "temetes" ? "temetes" : "normal"]].join("\n\n");
}

interface HianyzoEv {
  ev: number;
  hianyzo: number;
}

/** Az egyházfenntartói járulék fizetési státusza az Alapadatok táblázathoz - ha a pontos,
 * évenkénti hiányzó összegeket ismerjük (lásd `/api/persons/:id/hianyzo-evek`), pontosan
 * megnevezzük, mely évre mennyi hiányzik; ha ez az adat nem elérhető (pl. esperesként csak
 * megtekintési joga van), a rendszer általános "több éve elmaradt" jelzésére hagyatkozunk. */
function egyhazfenntartoSzoveg(nyelv: Nyelv, hianyzoEvek: HianyzoEv[] | null, tobbEveElmaradt: boolean): string {
  const labels = L[nyelv];
  if (hianyzoEvek !== null) {
    if (hianyzoEvek.length === 0) return labels.rendbenFizetve;
    const lista = hianyzoEvek.map((e) => `${e.ev}: ${e.hianyzo} lej`).join(", ");
    return `${labels.hianyzik}: ${lista}`;
  }
  if (tobbEveElmaradt) {
    return { hu: "több évre elmaradással", ro: "cu restanțe pe mai mulți ani", en: "in arrears for multiple years" }[nyelv];
  }
  return labels.rendbenFizetve;
}

export function HivatalosIgazolasok() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [gyulekezet, setGyulekezet] = useState<GyulekezetFejlec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tipus, setTipus] = useState<Tipus>("egyhaztagsag");
  const [nyelv, setNyelv] = useState<Nyelv>("hu");
  const [cel, setCel] = useState("");
  const [indoklas, setIndoklas] = useState("");
  const [iktatoszam, setIktatoszam] = useState("");
  const [cimzett, setCimzett] = useState("");
  const [keltHely, setKeltHely] = useState("");
  const [keltDatum, setKeltDatum] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [lelkeszNev, setLelkeszNev] = useState("");
  const [alapadatokLathato, setAlapadatokLathato] = useState(true);
  const [anyakonyviSzam, setAnyakonyviSzam] = useState("");
  // A leírás szövege szabadon szerkeszthető - típus-/nyelvváltáskor (és minden mögöttes adat
  // változásakor) egy javasolt alapszöveggel töltjük fel, DE amint a felhasználó belenyúl a
  // mezőbe, `leirasKezzelSzerkesztve` igazra vált, és onnantól semmi nem írja felül a kézi
  // szerkesztést - csak az explicit "Szöveg frissítése" gomb.
  const [leiras, setLeiras] = useState("");
  const [leirasKezzelSzerkesztve, setLeirasKezzelSzerkesztve] = useState(false);
  const [mentesAllapot, setMentesAllapot] = useState<"" | "mentes" | "mentve" | "hiba">("");

  // Szabadon szerkeszthető tények - a rendszerből előtöltve, ha van rögzített adat, de ha nincs,
  // üresen maradnak és utólag beírhatók (pl. régi, még nem digitalizált keresztelés/konfirmáció).
  const [keresztDatum, setKeresztDatum] = useState("");
  const [keresztHely, setKeresztHely] = useState("");
  const [konfDatum, setKonfDatum] = useState("");
  const [konfHely, setKonfHely] = useState("");
  const [hazassagDatum, setHazassagDatum] = useState("");
  const [hazassagHelye, setHazassagHelye] = useState("");
  const [hazastarsNev, setHazastarsNev] = useState("");
  const [elhalalozasDatum, setElhalalozasDatum] = useState("");
  const [temetesDatum, setTemetesDatum] = useState("");
  const [temetoNev, setTemetoNev] = useState("");
  // Az egyházfenntartó pontos, évenkénti hiányzó összegei - `null`, amíg be nem töltődött, vagy ha
  // a felhasználónak csak megtekintési (nem szerkesztési) joga van az illetőhöz, ilyenkor csak az
  // általános "több éve elmaradt" jelzésre hagyatkozunk.
  const [hianyzoEvek, setHianyzoEvek] = useState<HianyzoEv[] | null>(null);

  const isNyilatkozat = NYILATKOZAT_TIPUSOK.includes(tipus);
  const targy = TARGY_ALAP[nyelv][tipus];

  function refreshLeiras() {
    if (!person || !gyulekezet) return;
    const ctx = buildCtx(person, gyulekezet, {
      keresztDatum, keresztHely, konfDatum, konfHely, hazassagDatum, hazassagHelye, hazastarsNev,
      elhalalozasDatum, temetesDatum, temetoNev,
    });
    setLeiras(computeDefaultLeiras(tipus, nyelv, ctx, cel, indoklas, anyakonyviSzam));
    setLeirasKezzelSzerkesztve(false);
  }

  // Típus- vagy nyelvváltáskor (illetve az adatok betöltésekor) mindig visszaáll a javasolt
  // alapértelmezésre - ez egy tudatos váltás, indokolt felülírni a korábbi szöveget.
  useEffect(() => {
    refreshLeiras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipus, nyelv, person, gyulekezet]);

  // A mögöttes tények (Cél, Indoklás, Címzett, anyakönyvi szám, keresztelés/konfirmáció/házasság/
  // temetés dátuma és helye) változása is frissíti a javasolt szöveget - de csakis addig, amíg a
  // felhasználó kézzel nem nyúlt bele a mezőbe. Onnantól a kézi szerkesztés érintetlen marad.
  useEffect(() => {
    if (leirasKezzelSzerkesztve) return;
    refreshLeiras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cel, indoklas, cimzett, anyakonyviSzam, keresztDatum, keresztHely, konfDatum, konfHely, hazassagDatum, hazassagHelye, hazastarsNev, elhalalozasDatum, temetesDatum, temetoNev]);

  useEffect(() => {
    if (!id) return;
    api
      .get<PersonDetail>(`/api/persons/${id}`)
      .then((p) => {
        setPerson(p);
        // Külön, önálló hívás - ha nincs szerkesztési jog (pl. esperesként csak megtekinti), ez a
        // hívás 403-at ad, de ettől a fő adatbetöltés még sikeresen lezajlik.
        api
          .get<{ evek: HianyzoEv[] }>(`/api/persons/${id}/hianyzo-evek`)
          .then((res) => setHianyzoEvek(res.evek))
          .catch(() => setHianyzoEvek(null));
        const hm = p.householdMemberships[0];
        setKeltHely(hm?.household.address.telepules ?? "");
        setKeresztDatum(p.baptism?.datuma.slice(0, 10) ?? "");
        setKeresztHely(p.baptism?.helye ?? "");
        setKonfDatum(p.confirmation?.datuma.slice(0, 10) ?? "");
        setKonfHely(p.confirmation?.helye ?? "");
        const utolsoHazassag = p.csalad.hazastarsak[p.csalad.hazastarsak.length - 1];
        setHazassagDatum(utolsoHazassag?.datuma?.slice(0, 10) ?? "");
        setHazassagHelye(utolsoHazassag?.helye ?? "");
        setHazastarsNev(utolsoHazassag ? `${utolsoHazassag.vezeteknev} ${utolsoHazassag.keresztnev}` : "");
        setElhalalozasDatum(p.elhunytDatuma?.slice(0, 10) ?? "");
        setTemetesDatum(p.burial?.datuma?.slice(0, 10) ?? "");
        setTemetoNev(p.burial ? burialHelye(p.burial).temeto : "");
        return api.get<GyulekezetFejlec>(`/api/gyulekezetek/${p.gyulekezetId}`);
      })
      .then((g) => {
        setGyulekezet(g);
        setLelkeszNev(g.lelkeszNev);
      })
      .catch(() => setError("Nem sikerült betölteni a személy adatait"));
  }, [id]);

  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!person || !gyulekezet) return <p>Betöltés...</p>;

  const eletkor = computeAge(person.szuletesiDatum);
  const ctx = buildCtx(person, gyulekezet, {
    keresztDatum, keresztHely, konfDatum, konfHely, hazassagDatum, hazassagHelye, hazastarsNev,
    elhalalozasDatum, temetesDatum, temetoNev,
  });

  const labels = L[nyelv];
  const keltHelySzoveg = nyelv === "ro" && roTelepules(gyulekezet) ? roTelepules(gyulekezet) : keltHely;
  const keltSzoveg = `${labels.kelt} ${keltHelySzoveg}${keltHelySzoveg && keltDatum ? ", " : ""}${fmtDate(keltDatum, nyelv)}`;
  const ev = keltDatum ? keltDatum.slice(0, 4) : String(new Date().getFullYear());
  const iktatoszamSzoveg = iktatoszam ? `${iktatoszam}/${ev}` : "";
  const cimSora = TIPUS_CIM[nyelv][tipus];
  // Durva, karakterszám-alapú becslés arra, hogy a szöveg valószínűleg túllógna-e egy A4 oldalon -
  // nem pixelpontos mérés, de a korábban tesztelt, még biztosan egy oldalra férő tartalmakhoz (kb.
  // 500 karakter a legírásban) képest bőséges tartalékkal figyelmeztet, mielőtt túl hosszúra nőne.
  const leirasTulHosszu = leiras.length > 900;

  async function mentesSzemelyhez() {
    if (!person) return;
    setMentesAllapot("mentes");
    try {
      await api.put(`/api/persons/${person.id}`, {
        ...(keresztDatum ? { kereszteles: { datuma: keresztDatum, helye: keresztHely || null } } : {}),
        ...(konfDatum ? { konfirmacio: { datuma: konfDatum, helye: konfHely || null } } : {}),
      });
      setMentesAllapot("mentve");
    } catch {
      setMentesAllapot("hiba");
    }
  }

  return (
    <div className="stack">
      <div className="no-print stack">
        <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => navigate(-1)}>
          &larr; Vissza
        </button>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>
          Hivatalos igazolás — {person.vezeteknev} {person.keresztnev}
        </h1>

        <div className="card stack">
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>{labels.targy} (határozza meg az igazolás fajtáját és szövegét)</label>
              <select value={tipus} onChange={(e) => setTipus(e.target.value as Tipus)}>
                {(Object.keys(TIPUS_LABEL) as Tipus[]).map((t) => (
                  <option key={t} value={t}>
                    {TARGY_ALAP[nyelv][t]} — {TIPUS_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Nyelv</label>
              <select value={nyelv} onChange={(e) => setNyelv(e.target.value as Nyelv)}>
                {(Object.keys(L) as Nyelv[]).map((nv) => (
                  <option key={nv} value={nv}>
                    {L[nv].nyelvNev}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{labels.iktatoszam}</label>
              <input value={iktatoszam} onChange={(e) => setIktatoszam(e.target.value)} placeholder="pl. 42" />
            </div>
          </div>

          {!isNyilatkozat && (
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>{labels.cel} (mire kéri az igazoltatott)</label>
                <input value={cel} onChange={(e) => setCel(e.target.value)} placeholder="pl. iskolába beiratkozás" />
              </div>
              {(tipus === "kereszteles" || tipus === "konfirmacio" || tipus === "hazassag" || tipus === "allampolgarsag") && (
                <div className="field" style={{ flex: 1 }}>
                  <label>Anyakönyvi szám (a helyi anyakönyv bejegyzése)</label>
                  <input value={anyakonyviSzam} onChange={(e) => setAnyakonyviSzam(e.target.value)} placeholder="pl. 1/2008" />
                </div>
              )}
            </div>
          )}

          {isNyilatkozat && (
            <div className="field">
              <label>Indoklás</label>
              <input
                value={indoklas}
                onChange={(e) => setIndoklas(e.target.value)}
                placeholder={tipus === "kiiratkozas" ? "pl. más felekezetbe tér át" : "pl. házasságkötés alkalmával más felekezetbe tért, ezt most megbánta"}
              />
            </div>
          )}

          <div className="field">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ margin: 0 }}>Leírás szövege (szabadon szerkeszthető, ez kerül a nyomtatott szövegbe)</label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={refreshLeiras}>
                Szöveg frissítése a fenti adatok alapján
              </button>
            </div>
            <textarea
              rows={8}
              value={leiras}
              onChange={(e) => {
                setLeiras(e.target.value);
                setLeirasKezzelSzerkesztve(true);
              }}
              style={{ fontFamily: "inherit" }}
            />
            <p style={{ margin: "4px 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
              {leirasKezzelSzerkesztve
                ? "Kézzel szerkesztve - a fenti mezők módosítása innentől nem írja felül. A \"Szöveg frissítése\" gomb visszaállítja az automatikus követést."
                : "A fenti mezők (Cél, Anyakönyvi szám, Alapadatok stb.) módosítása automatikusan frissíti ezt a szöveget, amíg kézzel nem szerkeszti."}
            </p>
            {leirasTulHosszu && (
              <p style={{ margin: "4px 0 0", color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>
                Figyelem: ez a szöveg elég hosszú ahhoz, hogy nyomtatáskor túllógjon egy A4 oldalon - érdemes rövidíteni.
              </p>
            )}
          </div>

          <div className="stack" style={{ gap: 8, padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}>
            <button
              type="button"
              className="row"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", alignItems: "center", gap: 6, color: "inherit" }}
              onClick={() => setAlapadatokLathato((v) => !v)}
            >
              {alapadatokLathato ? <IconChevronDown style={{ width: 16, height: 16 }} /> : <IconChevronRight style={{ width: 16, height: 16 }} />}
              <strong>Alapadatok (a rendszerből előtöltve, szükség esetén felülírható)</strong>
            </button>
            {alapadatokLathato && (
              <div className="row">
                <div className="field">
                  <label>Keresztelés dátuma</label>
                  <DateInput value={keresztDatum} onChange={(e) => setKeresztDatum(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Keresztelés helye</label>
                  <input value={keresztHely} onChange={(e) => setKeresztHely(e.target.value)} placeholder={gyulekezet.nev} />
                </div>
                <div className="field">
                  <label>Konfirmáció dátuma</label>
                  <DateInput value={konfDatum} onChange={(e) => setKonfDatum(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Konfirmáció helye</label>
                  <input value={konfHely} onChange={(e) => setKonfHely(e.target.value)} placeholder={gyulekezet.nev} />
                </div>
              </div>
            )}
            {alapadatokLathato && (keresztDatum || konfDatum) && (
              <div className="row" style={{ alignItems: "center" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={mentesSzemelyhez} disabled={mentesAllapot === "mentes"}>
                  {mentesAllapot === "mentes" ? "Mentés..." : "Mentés a személy adataihoz is"}
                </button>
                <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                  {mentesAllapot === "mentve" && "Mentve ✓ - legközelebb már innen töltődik be."}
                  {mentesAllapot === "hiba" && <span style={{ color: "var(--color-danger)" }}>Nem sikerült menteni.</span>}
                  {mentesAllapot === "" && "Ez a dokumentumon túl a személy tényleges keresztelés/konfirmáció adatait is frissíti."}
                </span>
              </div>
            )}
          </div>

          {tipus === "hazassag" && (
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Házastárs neve</label>
                <input value={hazastarsNev} onChange={(e) => setHazastarsNev(e.target.value)} />
              </div>
              <div className="field">
                <label>Házasságkötés dátuma</label>
                <DateInput value={hazassagDatum} onChange={(e) => setHazassagDatum(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Házasságkötés helye</label>
                <input value={hazassagHelye} onChange={(e) => setHazassagHelye(e.target.value)} placeholder={gyulekezet.nev} />
              </div>
            </div>
          )}

          {tipus === "temetes" && (
            <div className="row">
              <div className="field">
                <label>Elhalálozás dátuma</label>
                <DateInput value={elhalalozasDatum} onChange={(e) => setElhalalozasDatum(e.target.value)} />
              </div>
              <div className="field">
                <label>Temetés dátuma</label>
                <DateInput value={temetesDatum} onChange={(e) => setTemetesDatum(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Temető neve</label>
                <input value={temetoNev} onChange={(e) => setTemetoNev(e.target.value)} />
              </div>
            </div>
          )}

          {(tipus === "egyhaztagsag" || tipus === "atiratkozas") && (
            <div className="field">
              <label>{labels.cimzett} (üresen hagyható)</label>
              <input
                value={cimzett}
                onChange={(e) => setCimzett(e.target.value)}
                placeholder="pl. Kolozsvári Református Egyházközség Lelkipásztori Hivatalának"
              />
            </div>
          )}
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Kelt hely</label>
              <input value={keltHely} onChange={(e) => setKeltHely(e.target.value)} />
            </div>
            <div className="field">
              <label>Kelt dátuma</label>
              <DateInput value={keltDatum} onChange={(e) => setKeltDatum(e.target.value)} />
            </div>
            {!isNyilatkozat && (
              <div className="field" style={{ flex: 1 }}>
                <label>Lelkész neve</label>
                <input value={lelkeszNev} onChange={(e) => setLelkeszNev(e.target.value)} />
              </div>
            )}
          </div>
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => window.print()}>
            {labels.nyomtatas}
          </button>
        </div>
      </div>

      <div className="print-document" style={{ padding: 24, fontSize: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <strong>{gyulekezetNevNyelv(gyulekezet, nyelv)}</strong>
            <div>{labels.hivatal}</div>
            {(gyulekezet.postaiCim || gyulekezet.publicAddress) && <div>{gyulekezet.postaiCim || gyulekezet.publicAddress}</div>}
            {gyulekezet.publicContact && <div>{gyulekezet.publicContact}</div>}
            {gyulekezet.codFiscal && <div>{labels.cuiLabel}: {gyulekezet.codFiscal}</div>}
          </div>
        </div>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
          <div style={{ fontStyle: "italic", textDecoration: "underline" }}>
            {iktatoszamSzoveg && `${labels.iktatoszam}: ${iktatoszamSzoveg}`}
          </div>
          <div style={{ fontStyle: "italic", textDecoration: "underline", textAlign: "right" }}>
            {labels.targy}: {targy}
          </div>
        </div>
        {cimzett && (
          <p style={{ margin: "8px 0 0" }}>
            <strong>{labels.cimzett}:</strong>
            <br />
            {cimzett}
          </p>
        )}

        <h2 style={{ textAlign: "center", margin: "16px 0" }}>{cimSora}</h2>

        {isNyilatkozat ? (
          <div style={{ lineHeight: 1.5 }}>
            <p style={{ margin: 0 }}>{labels.alulirott}</p>
            <p style={{ textAlign: "center", fontWeight: 700, fontSize: "1.1em", margin: "6px 0" }}>{ctx.nev.toUpperCase()}</p>
            <p style={{ textAlign: "center", margin: 0 }}>
              {labels.szul}: {ctx.szuletesiHely || "—"}, {ctx.szuletesiDatum(nyelv)}
              <br />
              {labels.lakcim}: {ctx.cim}
            </p>
            {leiras.split("\n\n").map((sor, i) => (
              <p key={i} style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>
                {sor}
              </p>
            ))}
          </div>
        ) : (
          <>
            <div style={{ lineHeight: 1.5 }}>
              {leiras.split("\n\n").map((sor, i) => (
                <p key={i} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {sor}
                </p>
              ))}
            </div>

            {alapadatokLathato && (
              <table style={{ marginTop: 12, borderCollapse: "collapse" }}>
                <tbody>
                  <AdatSor label={labels.szuletett} value={ctx.szuletesiDatum(nyelv)} />
                  <AdatSor label={labels.eletkor} value={eletkor !== null ? EV_SUFFIX[nyelv](eletkor) : ""} />
                  <AdatSor label={labels.cim} value={ctx.cim} />
                  <AdatSor label={labels.szulok} value={ctx.szuloNevek(nyelv)} />
                  <AdatSor label={labels.gyermekek} value={ctx.gyermekNevek} />
                  <AdatSor label={labels.kereszteles} value={keresztDatum ? `${ctx.keresztelesDatum(nyelv)}${keresztHely ? `, ${keresztHely}` : ""}` : ""} />
                  <AdatSor label={labels.konfirmacio} value={konfDatum ? `${ctx.konfirmacioDatum(nyelv)}${konfHely ? `, ${konfHely}` : ""}` : ""} />
                  <AdatSor label={labels.egyhazfenntarto} value={egyhazfenntartoSzoveg(nyelv, hianyzoEvek, person.tobbEveElmaradt)} />
                </tbody>
              </table>
            )}
          </>
        )}

        <div style={{ marginTop: 24 }}>
          <p style={{ margin: 0 }}>{keltSzoveg}</p>
          {isNyilatkozat ? (
            <div style={{ textAlign: "right", marginTop: 24 }}>
              <div style={{ display: "inline-block", textAlign: "center", width: 220 }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>{ctx.nev}</div>
                <div style={{ fontStyle: "italic" }}>{labels.alairas}</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "right", marginTop: 14 }}>
              <p style={{ margin: 0 }}>{labels.tisztelettel}</p>
              <div style={{ display: "inline-block", textAlign: "center", width: 220, marginTop: 24 }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>{lelkeszNev}</div>
                <div style={{ fontStyle: "italic" }}>{labels.lelkeszCim}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="no-print">
        <Link to={`/szemelyek/${id}`} className="btn btn-secondary">
          Vissza a személy adatlapjára
        </Link>
      </div>
    </div>
  );
}
