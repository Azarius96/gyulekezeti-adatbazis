import { Link } from "react-router-dom";
import { szemelyNev } from "../lib/nev";

export interface RokonRef {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  nem?: "FERFI" | "NO";
}

function Nevek({ cimke, emberek, ures }: { cimke: string; emberek: RokonRef[]; ures?: string }) {
  if (emberek.length === 0 && !ures) return null;
  return (
    <span>
      <span style={{ color: "var(--color-text-muted)" }}>{cimke}: </span>
      {emberek.length === 0 ? (
        <span style={{ color: "var(--color-text-muted)" }}>{ures}</span>
      ) : (
        emberek.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ", "}
            <Link to={`/szemelyek/${p.id}`} style={{ color: "var(--color-primary-dark)" }}>
              {szemelyNev(p)}
            </Link>
          </span>
        ))
      )}
    </span>
  );
}

/**
 * A személy rokonai a szülő-gyermek kapcsolatokból: szülei, gyerekei, és a SZÁMÍTOTT nagyszülei (a szülei szülei) és unokái
 * (a gyerekei gyerekei). Gyereknél a szülei mindig látszanak (ha nincs rögzítve, azt jelezzük), szülőnél a gyerekei is.
 */
export function SzerepRokonok({
  fiatal = false,
  szulok,
  gyermekek,
  nagyszulok = [],
  unokak = [],
  hazastarsak = [],
  nem,
}: {
  /** Kiskorú: a szülei akkor is látszanak, ha még nincsenek rögzítve (jelezzük, hogy hiányoznak). */
  fiatal?: boolean;
  szulok: RokonRef[];
  gyermekek: RokonRef[];
  nagyszulok?: RokonRef[];
  unokak?: RokonRef[];
  /** Az (élő, rögzített vagy háztartási szerepből következő) házastárs(ak) - kattintható névvel, "Férje:" / "Felesége:" címkével. */
  hazastarsak?: RokonRef[];
  nem?: "FERFI" | "NO" | null;
}) {
  if (!fiatal && szulok.length + gyermekek.length + nagyszulok.length + unokak.length + hazastarsak.length === 0) return null;
  return (
    <div style={{ fontSize: "var(--font-size-sm)", marginTop: 4, display: "flex", flexWrap: "wrap", gap: "2px 18px" }}>
      {hazastarsak.length > 0 && <Nevek cimke={nem === "FERFI" ? "Felesége" : nem === "NO" ? "Férje" : "Házastársa"} emberek={hazastarsak} />}
      <Nevek cimke="Gyerekei" emberek={gyermekek} />
      <Nevek cimke="Szülei" emberek={szulok} ures={fiatal ? "nincs rögzítve" : undefined} />
      <Nevek cimke="Nagyszülei" emberek={nagyszulok} />
      <Nevek cimke="Unokái" emberek={unokak} />
    </div>
  );
}
