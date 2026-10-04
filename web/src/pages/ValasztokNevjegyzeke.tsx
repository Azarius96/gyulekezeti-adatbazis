import { useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { DateInput } from "../components/DateInput";

const CURRENT_YEAR = new Date().getFullYear();

interface JogosultRow {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  szuletesiDatum: string | null;
  eletkor: number;
  cim: string;
}

interface NevjegyzekData {
  gyulekezetId: string;
  gyulekezetNev: string;
  ev: number;
  jogosultak: JogosultRow[];
  konfirmaciotKovetik: boolean;
  szekhely: string;
  lelkeszNev: string;
  gondnokNev: string;
}

const HONAP_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

function fmtHu(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}. ${HONAP_ROVID[m - 1]} ${d}.`;
}

export function ValasztokNevjegyzeke() {
  const gyulekezetek = useGyulekezetek();
  const [searchParams] = useSearchParams();
  // Mélylink támogatás (pl. az esperes megyei nézetéből egy adott gyülekezetre mutató linkkel) -
  // csak kezdőértékként, utána a felhasználó a lenti választóval bármikor válthat.
  const [gyulekezetId, setGyulekezetId] = useSelectedGyulekezet();
  const deepLinkId = searchParams.get("gyulekezetId");
  useEffect(() => {
    if (deepLinkId && deepLinkId !== gyulekezetId) setGyulekezetId(deepLinkId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId]);
  const [ev, setEv] = useState(String(CURRENT_YEAR));
  const [data, setData] = useState<NevjegyzekData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeGyulekezetId = gyulekezetId || gyulekezetek[0]?.id || "";

  // Szerkeszthető mezők - kizárólag az egyházközségre vonatkozó adatok (jogi ajánlott
  // alapértelmezéssel: 37. §. szerint máj. 15-ig elkészítve, máj. 15-23. közszemlén). Az esperesi
  // hivatal adatait (iktatószám, hitelesítés helye/dátuma) szándékosan NEM kérjük be - azokat az
  // esperesi hivatal tölti ki, a nyomtatott íven üresen hagyott helyre.
  const [keltHely, setKeltHely] = useState("");
  const [iktatoszam, setIktatoszam] = useState("");
  const [elkeszitesDatum, setElkeszitesDatum] = useState(`${ev}-05-15`);
  const [kozszemleKezdete, setKozszemleKezdete] = useState(`${ev}-05-15`);
  const [kozszemleVege, setKozszemleVege] = useState(`${ev}-05-23`);
  const [felszolalas, setFelszolalas] = useState("Felszólalás ellene nem történt.");
  const [zaradekDatum, setZaradekDatum] = useState(`${ev}-05-15`);
  const [lelkeszNev, setLelkeszNev] = useState("");
  const [gondnokNev, setGondnokNev] = useState("");

  function load() {
    if (!activeGyulekezetId) return;
    const params = new URLSearchParams({ gyulekezetId: activeGyulekezetId, ev });
    api
      .get<NevjegyzekData>(`/api/valasztoi-nevjegyzek?${params.toString()}`)
      .then((res) => {
        setData(res);
        setLelkeszNev(res.lelkeszNev);
        setGondnokNev(res.gondnokNev);
        // A székhely a háztartások címeiből kikövetkeztethető - alapértelmezésként betöltjük,
        // de felülírható, ha a valóságban mégis mást kell szerepeltetni.
        setKeltHely(res.szekhely);
      })
      .catch(() => setError("Nem sikerült betölteni a választói névjegyzéket"));
  }

  useEffect(load, [activeGyulekezetId, ev]);

  const jogosultakSzama = data?.jogosultak.length ?? 0;

  return (
    <div className="stack">
      <div className="no-print stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Választók névjegyzéke</h1>
            <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
              A rendszer a Kánon 12. §. a) és 37. §. szerint (konfirmált, 18 év feletti, az előző évi
              egyházfenntartói járulékát befizette) automatikusan összeállítja a jogosultak listáját -
              ellenőrizze, majd a lenti mezők kitöltése után nyomtassa ki.
            </p>
          </div>
        </div>

        {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

        {data && !data.konfirmaciotKovetik && (
          <p
            style={{
              margin: 0,
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-accent-light)",
              color: "var(--color-accent)",
            }}
          >
            Ebben a gyülekezetben senkinek sincs rögzítve konfirmáció a rendszerben, ezért a lista a
            konfirmáltság ellenőrzése nélkül, kizárólag kor és egyházfenntartói fizetés alapján készült.
            Kérjük, véglegesítés előtt ellenőrizze, hogy mindenki a listán ténylegesen konfirmált tag.
          </p>
        )}

        <div className="card stack">
          <div className="row">
            <div className="field" style={{ width: 120 }}>
              <label>Év</label>
              <input type="number" value={ev} onChange={(e) => setEv(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Kelt hely (székhely)</label>
              <input value={keltHely} onChange={(e) => setKeltHely(e.target.value)} placeholder="a háztartások címei alapján kitöltve" />
            </div>
            <div className="field">
              <label>Elkészítés dátuma</label>
              <DateInput value={elkeszitesDatum} onChange={(e) => setElkeszitesDatum(e.target.value)} />
            </div>
            <div className="field">
              <label>Iktatószám</label>
              <input value={iktatoszam} onChange={(e) => setIktatoszam(e.target.value)} placeholder="pl. 42" />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Közszemle kezdete</label>
              <DateInput value={kozszemleKezdete} onChange={(e) => setKozszemleKezdete(e.target.value)} />
            </div>
            <div className="field">
              <label>Közszemle vége</label>
              <DateInput value={kozszemleVege} onChange={(e) => setKozszemleVege(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Felszólalásról szöveg</label>
              <input value={felszolalas} onChange={(e) => setFelszolalas(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Lelkész neve</label>
              <input value={lelkeszNev} onChange={(e) => setLelkeszNev(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Gondnok neve</label>
              <input value={gondnokNev} onChange={(e) => setGondnokNev(e.target.value)} />
            </div>
            <div className="field">
              <label>Záradék dátuma (alsó "Kelt")</label>
              <DateInput value={zaradekDatum} onChange={(e) => setZaradekDatum(e.target.value)} />
            </div>
          </div>
          <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
            Az esperesi hivatal adatait (iktatószám, hitelesítés helye és dátuma) a nyomtatott íven üresen hagyjuk -
            azokat az esperesi hivatal tölti ki, amikor a felterjesztett példányt hitelesíti.
          </p>
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => window.print()}>
            Nyomtatás / PDF mentés
          </button>
        </div>
      </div>

      {data && (
        <div className="print-document">
          {iktatoszam && <p style={{ textAlign: "right", margin: 0 }}>Iktatószám: {iktatoszam}/{ev}</p>}
          <h2 style={{ textAlign: "center", margin: "4px 0" }}>
            Választói névjegyzék {ev}-{Number(ev) + 1}
          </h2>
          <p style={{ textAlign: "center", margin: 0 }}>{data.gyulekezetNev}</p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, lineHeight: 1.15 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 34 }}>Sorsz.</th>
                <th style={thStyle}>Név</th>
                <th style={thStyle}>Születési dátum (életkor)</th>
                <th style={thStyle}>Cím</th>
              </tr>
            </thead>
            <tbody>
              {data.jogosultak.map((p, i) => (
                <tr key={p.id}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={tdStyle}>
                    {p.vezeteknev} {p.keresztnev}
                  </td>
                  <td style={tdStyle}>
                    {p.szuletesiDatum ? fmtHu(p.szuletesiDatum) : ""} ({p.eletkor} év)
                  </td>
                  <td style={tdStyle}>{p.cim}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 30, lineHeight: 1.6 }}>
            <p>
              Kelt, {keltHely}, {elkeszitesDatum ? fmtHu(elkeszitesDatum) : ""}-én.
            </p>
            <p>
              Jelen {ev}-{Number(ev) + 1} évi választói névjegyzéket összeállította a {data.gyulekezetNev} Presbitériuma{" "}
              {jogosultakSzama} jogosulttal.
            </p>
            <p>
              Jelen névjegyzéket {kozszemleKezdete ? fmtHu(kozszemleKezdete) : ""} és{" "}
              {kozszemleVege ? fmtHu(kozszemleVege) : ""} között közszemlére kitettük. {felszolalas}
            </p>
            <p>
              {keltHely}, {zaradekDatum ? fmtHu(zaradekDatum) : ""}.
            </p>

            <div className="row" style={{ justifyContent: "space-between", marginTop: 40 }}>
              <div style={{ textAlign: "center", width: "40%" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>{lelkeszNev}</div>
                <div>lp.</div>
              </div>
              <div style={{ textAlign: "center", width: "40%" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>{gondnokNev}</div>
                <div>gondnok</div>
              </div>
            </div>

            {/* Az esperesi hivatal pontjait szándékosan üresen hagyjuk (üres vonalak) - ezeket
                (saját iktatószám, a jogosultak egyházmegyei szintű, összesített sorszámozása és
                hitelesítés helye/dátuma) csak az esperesi hivatal ismeri és tölti ki kézzel. */}
            <div style={{ marginTop: 50 }}>
              <p style={{ fontWeight: 700 }}>ESPERESI HIVATAL</p>
              <p>I.Sz. _________________ /{ev}</p>
              <p>Jelen _______ – _______ sorszámú Választók Névjegyzékét megerősítem: _______, azaz ___________________________ jogosulttal.</p>
              <p>_____________________________, {ev}. _____________________ ____.</p>
              <div style={{ textAlign: "right", marginTop: 40 }}>
                <div style={{ display: "inline-block", textAlign: "center", width: 220 }}>
                  <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>&nbsp;</div>
                  <div>esperes</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: CSSProperties = { border: "1px solid #999", padding: "2px 6px", textAlign: "left", fontSize: 11.5 };
const tdStyle: CSSProperties = { border: "1px solid #999", padding: "1px 6px", fontSize: 11.5 };
