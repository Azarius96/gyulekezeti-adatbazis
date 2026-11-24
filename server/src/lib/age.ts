export function ageOn(birth: Date, ref: Date): number {
  // A születési dátum UTC-éjfélként tárolt naptári nap (időzónától független); a viszonyítási nap a helyi naptári nap.
  let age = ref.getFullYear() - birth.getUTCFullYear();
  const m = ref.getMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getUTCDate())) age--;
  return age;
}

/**
 * A személy életkora az adott év január 1-jén: az egyházfenntartói díj és a díjszabás szerinti statisztikák ezt használják
 * (egyetlen közös szabály). A születési dátum UTC-éjfélként tárolt naptári nap, ezért a számítás nem függ a szerver időzónájától.
 */
export function ageOnJan1(birth: Date, year: number): number {
  const evSzul = birth.getUTCFullYear();
  // január 1-jén született: már betöltötte az évet; egy későbbi napon született: még nem
  const mulva = birth.getUTCMonth() > 0 || birth.getUTCDate() > 1 ? 1 : 0;
  return year - evSzul - mulva;
}
