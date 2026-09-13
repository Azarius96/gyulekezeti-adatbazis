// Dátum-only stringek (pl. "1990-05-04" vagy egy ISO időbélyeg eleje) biztonságos, időzóna-független
// feldolgozása: SOHA `new Date(iso)` + helyi getterek (`.getFullYear()` stb.), mert az UTC-ként
// értelmezett éjféli időpontot a böngésző időzónája visszatolhatja egy nappal (pl. amerikai
// időzónából nézve). Helyette mindig a stringet szeleteljük/bontjuk szét.
function parseDateOnly(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

export function ageOn(szuletesiDatum: string | null | undefined, atIso: string): number | null {
  if (!szuletesiDatum) return null;
  const birth = parseDateOnly(szuletesiDatum);
  const at = parseDateOnly(atIso);
  let eletkor = at.y - birth.y;
  const honapKulonbseg = at.m - birth.m;
  if (honapKulonbseg < 0 || (honapKulonbseg === 0 && at.d < birth.d)) eletkor--;
  return eletkor;
}

export function age(szuletesiDatum: string | null | undefined): number | null {
  if (!szuletesiDatum) return null;
  const now = new Date();
  return ageOn(szuletesiDatum, `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`);
}
