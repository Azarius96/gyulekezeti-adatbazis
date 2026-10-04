import { useEffect, useState } from "react";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { api } from "../lib/api";

const CURRENT_YEAR = new Date().getFullYear();

interface Sor {
  ferfi: number;
  no: number;
  egyutt: number;
}

interface JelentesAdatok {
  gyulekezetId: string;
  gyulekezetNev: string;
  ev: number;
  elozoEviLelekszam: Sor;
  keresztelt: Sor;
  eltemetett: Sor;
  bekoltozott: Sor;
  decemberVegiLelekszam: Sor;
  valasztoiNevjegyzekLetszam: number;
  egyhazfenntartoOsszeg: number;
  otEveNemFizetok: number;
  masTelepulesenElo: number;
  csaladokSzama: number;
  csaladokEgyezoVallasu: number;
  csaladokVegyesVallasu: number;
  csaladokOzvegy: number;
  csaladokEgyedulallo: number;
  hazassagokSzama: number;
  hazassagEgyezoVallasu: number;
  hazassagNemEgyezoVallasu: number;
}

export function LelekszamJelentes() {
  const gyulekezetek = useGyulekezetek();
  const [gyulekezetId] = useSelectedGyulekezet();
  const [ev, setEv] = useState(String(CURRENT_YEAR));
  const [data, setData] = useState<JelentesAdatok | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeGyulekezetId = gyulekezetId || gyulekezetek[0]?.id || "";

  useEffect(() => {
    if (!activeGyulekezetId) return;
    const params = new URLSearchParams({ gyulekezetId: activeGyulekezetId, ev });
    api
      .get<JelentesAdatok>(`/api/lelekszam-jelentes?${params.toString()}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch(() => setError("Nem sikerült betölteni a lélekszám adatokat"));
  }, [activeGyulekezetId, ev]);

  const termeszetesSzaporulat = data ? Math.max(0, data.keresztelt.egyutt - data.eltemetett.egyutt) : 0;
  const termeszetesApadas = data ? Math.max(0, data.eltemetett.egyutt - data.keresztelt.egyutt) : 0;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Lélekszám statisztika</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
            A gyülekezet lélekszámával kapcsolatos, a rendszer adataiból megbízhatóan számítható mutatók áttekintése.
            Nem hivatalos, kitölthető/letölthető jelentés - csak tájékoztató statisztika.
          </p>
        </div>
      </div>

      <div className="field" style={{ width: 120 }}>
        <label>Év</label>
        <input type="number" value={ev} onChange={(e) => setEv(e.target.value)} />
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {data && (
        <div className="stack">
          <div className="card-grid">
            <StatCard label="Előző évi lélekszám" sor={data.elozoEviLelekszam} />
            <StatCard label="Lélekszám dec. 31-én" sor={data.decemberVegiLelekszam} />
            <StatCard label="Keresztelésben részesült" sor={data.keresztelt} />
            <StatCard label="Eltemettetett" sor={data.eltemetett} />
            <StatCardEgyutt label="Természetes szaporulat" ertek={termeszetesSzaporulat} />
            <StatCardEgyutt label="Természetes apadás" ertek={termeszetesApadas} />
            <StatCard label="Beköltözött az egyházközségbe" sor={data.bekoltozott} />
            <StatCardEgyutt label="Választói névjegyzék létszáma" ertek={data.valasztoiNevjegyzekLetszam} />
            <StatCardEgyutt label="Egyházfenntartás éves összege (lej)" ertek={data.egyhazfenntartoOsszeg} />
            <StatCardEgyutt label="Régóta nem fizető felnőttek száma" ertek={data.otEveNemFizetok} />
            <StatCardEgyutt label="Más településen élők száma" ertek={data.masTelepulesenElo} />
            <StatCardEgyutt label="Családok száma" ertek={data.csaladokSzama} />
            <StatCardEgyutt label="Házasságkötések száma" ertek={data.hazassagokSzama} />
          </div>

          <div className="card stack">
            <strong>Családok vallási/családi bontása</strong>
            <div className="row" style={{ flexWrap: "wrap", gap: 24 }}>
              <BontasSor label="Egyező vallású" ertek={data.csaladokEgyezoVallasu} />
              <BontasSor label="Vegyes vallású" ertek={data.csaladokVegyesVallasu} />
              <BontasSor label="Özvegy" ertek={data.csaladokOzvegy} />
              <BontasSor label="Egyedülálló" ertek={data.csaladokEgyedulallo} />
            </div>
          </div>

          <div className="card stack">
            <strong>Házasságkötések vallási bontása</strong>
            <div className="row" style={{ flexWrap: "wrap", gap: 24 }}>
              <BontasSor label="Egyező vallású" ertek={data.hazassagEgyezoVallasu} />
              <BontasSor label="Nem egyező vallású" ertek={data.hazassagNemEgyezoVallasu} />
            </div>
          </div>

          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", margin: 0 }}>
            Az előző évi és december végi lélekszám, valamint a beköltözés a jelenlegi állományból visszamenőleg
            becsült érték, nem történeti pillanatfelvétel. Az elköltözés, felekezetváltás, nemzetiség és más
            gyülekezetben viselt tagság nincs a rendszerben nyomon követve, ezért itt nem szerepel.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, sor }: { label: string; sor: Sor }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-xl)", fontWeight: 800 }}>{sor.egyutt}</div>
      <div style={{ color: "var(--color-text-muted)", marginTop: 6 }}>{label}</div>
      <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", marginTop: 4 }}>
        férfi: {sor.ferfi} · nő: {sor.no}
      </div>
    </div>
  );
}

function StatCardEgyutt({ label, ertek }: { label: string; ertek: number }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-xl)", fontWeight: 800 }}>{ertek}</div>
      <div style={{ color: "var(--color-text-muted)", marginTop: 6 }}>{label}</div>
    </div>
  );
}

function BontasSor({ label, ertek }: { label: string; ertek: number }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-lg)", fontWeight: 700 }}>{ertek}</div>
      <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{label}</div>
    </div>
  );
}
