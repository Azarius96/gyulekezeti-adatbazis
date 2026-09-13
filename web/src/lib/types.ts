export type SzerepKor = "ADMIN" | "PUSPOK" | "ESPERES" | "LELKESZ" | "DELEGALT";

export interface UserRoleEntry {
  id: string;
  szerepKor: SzerepKor;
  gyulekezetId: string | null;
  egyhazmegyeId: string | null;
  keruletId: string | null;
}

export interface CurrentUser {
  id: string;
  nev: string;
  email: string;
  roles: UserRoleEntry[];
}

export function isAdmin(user: CurrentUser | null): boolean {
  return !!user?.roles.some((r) => r.szerepKor === "ADMIN");
}

export function ownGyulekezetIds(user: CurrentUser | null): string[] {
  if (!user) return [];
  return user.roles
    .filter((r) => (r.szerepKor === "LELKESZ" || r.szerepKor === "DELEGALT") && r.gyulekezetId)
    .map((r) => r.gyulekezetId as string);
}

export function pendingLelkeszRole(user: CurrentUser | null): UserRoleEntry | undefined {
  return user?.roles.find((r) => r.szerepKor === "LELKESZ" && !r.gyulekezetId);
}

/**
 * Ugyanaz a szabály, mint a szerveren (ld. server/src/auth/scope.ts canEditGyulekezet): esperes/
 * püspök szerepkör önmagában csak LÁTHATÓVÁ teszi a hozzá tartozó gyülekezeteket (statisztika,
 * áttekintés), szerkesztési jogot NEM ad - ahhoz LELKESZ/DELEGALT szerepkör kell ugyanarra a
 * gyülekezetre. Ez a UI-oldali tükörképe: ne jelenjenek meg szerkesztő gombok/űrlapok olyan
 * gyülekezetnél, amit a felhasználó csak esperesként/püspökként lát, ne a sajátjaként.
 */
export function canEditGyulekezet(user: CurrentUser | null, gyulekezetId: string | null | undefined): boolean {
  if (!gyulekezetId) return false;
  if (isAdmin(user)) return true;
  return ownGyulekezetIds(user).includes(gyulekezetId);
}

export interface PersonListItem {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  nem: "FERFI" | "NO";
  szuletesiDatum: string | null;
  elhunyt: boolean;
  gyulekezetId: string;
}

export interface FamilyPersonRef {
  id: string;
  vezeteknev: string;
  keresztnev: string;
}

export interface FamilyOverview {
  szulok: (FamilyPersonRef & { linkId: string })[];
  nagyszulok: FamilyPersonRef[];
  gyermekek: (FamilyPersonRef & { linkId: string })[];
  unokak: FamilyPersonRef[];
  hazastarsak: (FamilyPersonRef & { datuma: string | null; helye: string | null; kulso: boolean; marriageId: string; vege: string | null })[];
  testverek: FamilyPersonRef[];
}

export type CsaladiAllapot = "NOTLEN_HAJADON" | "HAZAS" | "OZVEGY" | "ELVALT";

export interface DuesResult {
  /** Volt-e egyáltalán rögzített díjszabás erre az évre ennél a gyülekezetnél. */
  ismertDijszabas: boolean;
  esedekesOsszeg: number | null;
  mentes: boolean;
  kedvezmenyes: boolean;
  korsav: { korhatarTol: number; korhatarIg: number } | null;
}

/** Mentesség = zöld, kedvezmény = sárga, egyébként nincs kiemelés. */
export function duesColor(d: DuesResult): { bg: string; fg: string } | null {
  if (d.mentes) return { bg: "rgba(52, 199, 89, 0.16)", fg: "#3dd873" };
  if (d.kedvezmenyes) return { bg: "rgba(255, 159, 10, 0.16)", fg: "#ffb340" };
  return null;
}

/** Több éve elmaradt = piros, ez mindig felülírja a mentesség/kedvezmény színét. */
export function memberHighlight(d: DuesResult, tobbEveElmaradt: boolean): { bg: string; fg: string } | null {
  if (tobbEveElmaradt) return { bg: "rgba(255, 69, 58, 0.18)", fg: "#ff7a70" };
  return duesColor(d);
}

export interface PersonDetail extends PersonListItem {
  szuletesiHely: string | null;
  vallas: string | null;
  csaladiAllapot: CsaladiAllapot | null;
  megjegyzes: string | null;
  nyitoTartozas: string;
  baptism: { datuma: string; helye: string | null; lelkeszNeve: string | null } | null;
  confirmation: { datuma: string; helye: string | null; lelkeszNeve: string | null } | null;
  positions: { id: string; tisztseg: string; kezdete: string; vege: string | null }[];
  duesPayments: { id: string; ev: number; osszeg: string; createdAt: string; updatedAt: string }[];
  donations: { id: string; ev: number; osszeg: string; celja: string | null; createdAt: string; updatedAt: string }[];
  egyhazfenntarto: DuesResult;
  fizetveIdenre: boolean;
  tobbEveElmaradt: boolean;
  householdMemberships: {
    id: string;
    szerep: string;
    household: { id: string; nev: string | null; address: { telepules: string; utca: string; hazszam: string } };
  }[];
  csalad: FamilyOverview;
  elhunytDatuma: string | null;
  burial: {
    id: string;
    datuma: string;
    sirhely: { jelzes: string; parcella: { jelzes: string; cemetery: { nev: string } } };
  } | null;
  movingHistory: {
    id: string;
    regiCim: string;
    ujCim: string;
    indoklas: string | null;
    status: "FUGGOBEN" | "ELFOGADVA" | "ELUTASITVA" | "ISMERETLEN_CELBA";
    kezdemenyezve: string;
    elbiralva: string | null;
    forrasGyulekezet: { nev: string } | null;
    celGyulekezet: { nev: string } | null;
  }[];
}

export interface Gyulekezet {
  id: string;
  nev: string;
}

export interface DashboardStats {
  osszlétszám: number;
  elhunytakIdenre: number;
  ferfiak: number;
  nok: number;
  konfirmaloKoruak: number;
  fiatalkoruak: number;
  presbiterek: number;
  gondnokok: number;
  noszovetseg: number;
  korEloszlas: { label: string; count: number }[];
  legutobbiAktivitas: { id: string; personId: string; nev: string; leiras: string; idopont: string }[];
}
