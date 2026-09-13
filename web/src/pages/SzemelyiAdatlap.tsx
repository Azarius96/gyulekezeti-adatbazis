import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PersonDetail } from "../lib/types";
import { DateInput } from "../components/DateInput";

interface GyulekezetFejlec {
  id: string;
  nev: string;
  publicAddress: string | null;
  publicContact: string | null;
  lelkeszNev: string;
}

const csaladiAllapotLabels: Record<string, string> = {
  NOTLEN_HAJADON: "Nőtlen / hajadon",
  HAZAS: "Házas",
  OZVEGY: "Özvegy",
  ELVALT: "Elvált",
};

const szerepLabels: Record<string, string> = {
  CSALADFO: "családfő",
  HAZASTARS: "házastárs",
  GYERMEK: "gyermek",
  EGYEB: "egyéb",
};

const tisztsegLabels: Record<string, string> = {
  PRESBITER: "Presbiter",
  POTPRESBITER: "Pótpresbiter",
  GONDNOK: "Gondnok",
  FOGONDNOK: "Főgondnok",
  NOSZOVETSEGI_TAG: "Nőszövetségi tag",
};

const HONAP_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

function fmtHu(iso: string | null | undefined): string {
  if (!iso) return "";
  // A `/api/persons/:id` végpont a dátumokat teljes ISO-időbélyegként adja vissza
  // ("2008-10-27T00:00:00.000Z"), nem csak "ÉÉÉÉ-HH-NN"-ként - ezért előbb levágjuk a
  // dátum-részt, és NEM a Date objektumon keresztül parse-oljuk (az a helyi időzóna miatt
  // egy nappal korábbra tolná a dátumot UTC+ zónában).
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${y}. ${HONAP_ROVID[m - 1]} ${d}.`;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <tr>
      <td style={{ padding: "3px 12px 3px 0", fontWeight: 600, verticalAlign: "top", whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ padding: "3px 0" }}>{value}</td>
    </tr>
  );
}

export function SzemelyiAdatlap() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [gyulekezet, setGyulekezet] = useState<GyulekezetFejlec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cimzett, setCimzett] = useState("");
  const [targy, setTargy] = useState("");
  const [iktatoszam, setIktatoszam] = useState("");
  const [keltHely, setKeltHely] = useState("");
  const [keltDatum, setKeltDatum] = useState(todayIso());
  const [lelkeszNev, setLelkeszNev] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .get<PersonDetail>(`/api/persons/${id}`)
      .then((p) => {
        setPerson(p);
        setTargy(`Adatszolgáltatás ${p.vezeteknev} ${p.keresztnev} egyháztag adatairól`);
        return api.get<GyulekezetFejlec>(`/api/gyulekezetek/${p.gyulekezetId}`);
      })
      .then((g) => {
        setGyulekezet(g);
        setLelkeszNev(g.lelkeszNev);
      })
      .catch(() => setError("Nem sikerült betölteni a személy adatlapját"));
  }, [id]);

  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!person || !gyulekezet) return <p>Betöltés...</p>;

  const hm = person.householdMemberships[0];
  const cim = hm ? `${hm.household.address.telepules}, ${hm.household.address.utca} ${hm.household.address.hazszam}` : "";

  const hazastarsak = person.csalad.hazastarsak
    .map((h) => `${h.vezeteknev} ${h.keresztnev}${h.datuma ? ` (${fmtHu(h.datuma)}${h.vege ? `, lezárva: ${fmtHu(h.vege)}` : ""})` : ""}`)
    .join("; ");
  const szulok = person.csalad.szulok.map((s) => `${s.vezeteknev} ${s.keresztnev}`).join("; ");
  const testverek = person.csalad.testverek.map((s) => `${s.vezeteknev} ${s.keresztnev}`).join("; ");
  const gyermekek = person.csalad.gyermekek.map((g) => `${g.vezeteknev} ${g.keresztnev}`).join("; ");
  const tisztsegek = person.positions
    .map((pos) => `${tisztsegLabels[pos.tisztseg] ?? pos.tisztseg} (${fmtHu(pos.kezdete)}${pos.vege ? `–${fmtHu(pos.vege)}` : " –"})`)
    .join("; ");
  const befizetesek = person.duesPayments.map((d) => `${d.ev}: ${Number(d.osszeg)} lej`).join("; ");
  const adomanyok = person.donations.map((d) => `${d.ev}: ${Number(d.osszeg)} lej${d.celja ? ` (${d.celja})` : ""}`).join("; ");
  const nyitoTartozas = Number(person.nyitoTartozas);

  return (
    <div className="stack">
      <div className="no-print stack">
        <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => navigate(-1)}>
          &larr; Vissza
        </button>
        <div>
          <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>
            Személyi adatlap — {person.vezeteknev} {person.keresztnev}
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
            A rendszerben rögzített összes adat a személyről, hivatalos levélfejléccel. Töltse ki a címzettet és az
            iktatási adatokat, majd nyomtassa vagy mentse PDF-ként.
          </p>
        </div>

        <div className="card stack">
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Címzett</label>
              <input
                value={cimzett}
                onChange={(e) => setCimzett(e.target.value)}
                placeholder="pl. Kolozsvári Református Egyházközség Lelkészi Hivatala"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Tárgy</label>
              <input value={targy} onChange={(e) => setTargy(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Iktatószám</label>
              <input value={iktatoszam} onChange={(e) => setIktatoszam(e.target.value)} placeholder="pl. 42" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Kelt hely</label>
              <input value={keltHely} onChange={(e) => setKeltHely(e.target.value)} placeholder="pl. Búzásbocsárd" />
            </div>
            <div className="field">
              <label>Kelt dátuma</label>
              <DateInput value={keltDatum} onChange={(e) => setKeltDatum(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Lelkész neve (aláírás)</label>
              <input value={lelkeszNev} onChange={(e) => setLelkeszNev(e.target.value)} />
            </div>
          </div>
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => window.print()}>
            Nyomtatás / PDF mentés
          </button>
        </div>
      </div>

      <div className="print-document">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <strong>{gyulekezet.nev}</strong>
            <div>Lelkészi Hivatala</div>
            {gyulekezet.publicAddress && <div>{gyulekezet.publicAddress}</div>}
            {gyulekezet.publicContact && <div>{gyulekezet.publicContact}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            {iktatoszam && <div>Szám: {iktatoszam}</div>}
            <div>Kelt: {keltHely}{keltHely && keltDatum ? ", " : ""}{fmtHu(keltDatum)}</div>
          </div>
        </div>

        {targy && <p style={{ marginTop: 24 }}><strong>Tárgy:</strong> {targy}</p>}
        {cimzett && (
          <p>
            <strong>Címzett:</strong> {cimzett}
          </p>
        )}

        <h2 style={{ textAlign: "center", marginTop: 30 }}>SZEMÉLYI ADATLAP</h2>

        <table style={{ marginTop: 16, borderCollapse: "collapse" }}>
          <tbody>
            <Row label="Név" value={`${person.vezeteknev} ${person.keresztnev}`} />
            <Row label="Nem" value={person.nem === "FERFI" ? "Férfi" : "Nő"} />
            <Row label="Születési dátum" value={fmtHu(person.szuletesiDatum)} />
            <Row label="Születési hely" value={person.szuletesiHely ?? ""} />
            <Row label="Vallás" value={person.vallas ?? ""} />
            <Row label="Családi állapot" value={person.csaladiAllapot ? csaladiAllapotLabels[person.csaladiAllapot] : ""} />
            <Row label="Elhunyt" value={person.elhunyt ? `igen — ${fmtHu(person.elhunytDatuma)}` : ""} />
            <Row label="Cím" value={cim} />
            <Row label="Szerepkör a háztartásban" value={hm ? szerepLabels[hm.szerep] ?? hm.szerep : ""} />
            <Row label="Gyülekezet" value={gyulekezet.nev} />
            <Row
              label="Keresztelés"
              value={
                person.baptism
                  ? `${fmtHu(person.baptism.datuma)}${person.baptism.helye ? `, ${person.baptism.helye}` : ""}${
                      person.baptism.lelkeszNeve ? ` (lelkész: ${person.baptism.lelkeszNeve})` : ""
                    }`
                  : ""
              }
            />
            <Row
              label="Konfirmáció"
              value={
                person.confirmation
                  ? `${fmtHu(person.confirmation.datuma)}${person.confirmation.helye ? `, ${person.confirmation.helye}` : ""}${
                      person.confirmation.lelkeszNeve ? ` (lelkész: ${person.confirmation.lelkeszNeve})` : ""
                    }`
                  : ""
              }
            />
            <Row label="Házastárs(ak)" value={hazastarsak} />
            <Row label="Szülők" value={szulok} />
            <Row label="Testvérek" value={testverek} />
            <Row label="Gyermekek" value={gyermekek} />
            <Row label="Tisztségek" value={tisztsegek} />
            <Row label="Korábbi (nyitó) tartozás" value={nyitoTartozas ? `${nyitoTartozas} lej` : ""} />
            <Row label="Egyházfenntartó befizetések" value={befizetesek} />
            <Row label="Adományok" value={adomanyok} />
            <Row label="Megjegyzés" value={person.megjegyzes ?? ""} />
          </tbody>
        </table>

        <div style={{ marginTop: 50 }}>
          <p>
            Kelt, {keltHely}{keltHely && keltDatum ? ", " : ""}{fmtHu(keltDatum)}
          </p>
          <div style={{ textAlign: "right", marginTop: 40 }}>
            <div style={{ display: "inline-block", textAlign: "center", width: 220 }}>
              <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>{lelkeszNev}</div>
              <div>lp.</div>
            </div>
          </div>
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
