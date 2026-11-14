import { Link } from "react-router-dom";

export interface RokonRef {
  id: string;
  vezeteknev: string;
  keresztnev: string;
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
              {p.vezeteknev} {p.keresztnev}
            </Link>
          </span>
        ))
      )}
    </span>
  );
}

/**
 * A háztartásbeli szerephez kötött rokonok: gyereknél a szülei, szülőnél (apa/anya) a gyerekei ÉS a saját szülei is.
 * Az adatok a szülő-gyermek kapcsolatokból jönnek (ugyanazok, mint a személy "Család" kártyáján).
 */
export function SzerepRokonok({ szerep, szulok, gyermekek }: { szerep: string; szulok: RokonRef[]; gyermekek: RokonRef[] }) {
  const szulo = szerep === "CSALADFO" || szerep === "HAZASTARS";
  if (szerep === "GYERMEK") {
    return (
      <div style={{ fontSize: "var(--font-size-sm)", marginTop: 4 }}>
        <Nevek cimke="Szülei" emberek={szulok} ures="nincs rögzítve" />
      </div>
    );
  }
  if (szulo) {
    if (szulok.length === 0 && gyermekek.length === 0) return null;
    return (
      <div style={{ fontSize: "var(--font-size-sm)", marginTop: 4, display: "flex", flexWrap: "wrap", gap: "2px 18px" }}>
        <Nevek cimke="Gyerekei" emberek={gyermekek} ures="nincs rögzítve" />
        <Nevek cimke="Szülei" emberek={szulok} />
      </div>
    );
  }
  return null;
}
