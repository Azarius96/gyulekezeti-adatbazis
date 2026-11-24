import type { ComponentType, ReactNode, SVGProps } from "react";

export type SzekcioSzin = "kek" | "turkiz" | "zold" | "narancs" | "lila";

/**
 * A szerkesztőűrlapok egy tematikus egysége: saját színe, ikonja és címe van, hogy az űrlap nagy, sok mezős felülete
 * átlátható blokkokra essen szét (személyes adatok, lakcím, család, anyakönyvi adatok, pénzügy...).
 */
export function SzerkesztoSzekcio({
  cim,
  leiras,
  szin,
  ikon: Ikon,
  children,
}: {
  cim: string;
  leiras?: string;
  szin: SzekcioSzin;
  ikon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
}) {
  return (
    <section className={`szekcio szekcio-${szin}`}>
      <header className="szekcio-fej">
        <span className="szekcio-ikon">
          <Ikon style={{ width: 22, height: 22 }} />
        </span>
        <div>
          <h3 className="szekcio-cim">{cim}</h3>
          {leiras && <p className="szekcio-leiras">{leiras}</p>}
        </div>
      </header>
      <div className="szekcio-torzs stack">{children}</div>
    </section>
  );
}
