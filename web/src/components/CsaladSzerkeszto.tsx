import { DateInput } from "./DateInput";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { szerepNev, type PersonDetail } from "../lib/types";

interface Jelolt {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  nem: "FERFI" | "NO";
  szuletesiDatum: string | null;
  elhunyt: boolean;
  cim?: string | null;
}

type SzerepValasztas = "SZULO" | "GYERMEK" | "EGYEB";

function jeloltCimke(j: Jelolt): string {
  const ev = j.szuletesiDatum ? ` (${j.szuletesiDatum.slice(0, 4)})` : "";
  return `${j.vezeteknev} ${j.keresztnev}${ev}${j.elhunyt ? " †" : ""}${j.cim ? ` — ${j.cim}` : ""}`;
}

function korkulonbseg(szulo: Jelolt | undefined, szuletesiDatum: string | null): number | null {
  if (!szulo?.szuletesiDatum || !szuletesiDatum) return null;
  return Math.round((new Date(szuletesiDatum).getTime() - new Date(szulo.szuletesiDatum).getTime()) / (365.25 * 24 * 3600 * 1000));
}

/**
 * A személy családi kapcsolatainak szerkesztése legördülő menükkel: szerepe a háztartásban (apa/anya, gyerek, egyéb),
 * apja, anyja és gyerekei. A nagyszülők és az unokák ezekből AUTOMATIKUSAN számolódnak (itt csak megjelennek).
 * A hook `alkalmaz()` függvénye a mentéskor végrehajtja a változásokat (kapcsolatok létrehozása/törlése, szerep).
 */
export function useCsaladSzerkeszto(person: PersonDetail, szuletesiDatum: string | null) {
  const tagsag = person.householdMemberships.find((hm) => !hm.vege) ?? null;
  const szuloVoltEredetileg = tagsag?.szerep === "CSALADFO" || tagsag?.szerep === "HAZASTARS";
  const eredetiSzerep: SzerepValasztas = szuloVoltEredetileg ? "SZULO" : tagsag?.szerep === "GYERMEK" ? "GYERMEK" : "EGYEB";
  const eredetiApa = person.csalad.szulok.find((s) => s.nem === "FERFI") ?? null;
  const eredetiAnya = person.csalad.szulok.find((s) => s.nem === "NO") ?? null;

  const [szerep, setSzerep] = useState<SzerepValasztas>(eredetiSzerep);
  const [apaId, setApaId] = useState(eredetiApa?.id ?? "");
  const [anyaId, setAnyaId] = useState(eredetiAnya?.id ?? "");
  const [gyerekIds, setGyerekIds] = useState<string[]>(person.csalad.gyermekek.map((g) => g.id));
  const [jeloltek, setJeloltek] = useState<Jelolt[]>([]);
  const [masikCsaladfo, setMasikCsaladfo] = useState(false);
  // Házastárs hozzáadása: meglévő személy a listából, vagy külső (nem gyülekezeti tag) neve
  const [hazastarsId, setHazastarsId] = useState("");
  const [kulsoNev, setKulsoNev] = useState("");
  const [hazassagDatum, setHazassagDatum] = useState("");

  useEffect(() => {
    api
      .get<Jelolt[]>(`/api/persons?gyulekezetId=${person.gyulekezetId}`)
      .then((rows) => setJeloltek(rows.filter((r) => r.id !== person.id)))
      .catch(() => setJeloltek([]));
    if (tagsag) {
      api
        .get<{ members: { id: string; szerep: string }[] }>(`/api/households/${tagsag.household.id}`)
        .then((h) => setMasikCsaladfo(h.members.some((m) => m.id !== tagsag.id && m.szerep === "CSALADFO")))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id]);

  // A meglévő rokonok akkor is választhatók, ha nem a gyülekezet listájában vannak (pl. másik gyülekezet tagja)
  const ismertek: Jelolt[] = [
    ...jeloltek,
    ...[...person.csalad.szulok, ...person.csalad.gyermekek]
      .filter((r) => !jeloltek.some((j) => j.id === r.id))
      .map((r) => ({ id: r.id, vezeteknev: r.vezeteknev, keresztnev: r.keresztnev, nem: r.nem ?? "FERFI", szuletesiDatum: null, elhunyt: false }) as Jelolt),
  ];
  const apak = ismertek.filter((j) => j.nem === "FERFI");
  const anyak = ismertek.filter((j) => j.nem === "NO");
  const gyerekek = gyerekIds.map((id) => ismertek.find((j) => j.id === id)).filter((j): j is Jelolt => !!j);

  async function alkalmaz() {
    // Szerep a háztartásban
    if (tagsag && szerep !== eredetiSzerep) {
      const ujSzerep = szerep === "SZULO" ? (masikCsaladfo ? "HAZASTARS" : "CSALADFO") : szerep;
      await api.put(`/api/household-members/${tagsag.id}`, { szerep: ujSzerep });
    }
    // Apja / anyja
    for (const [eredeti, ujId] of [
      [eredetiApa, apaId],
      [eredetiAnya, anyaId],
    ] as const) {
      if ((eredeti?.id ?? "") === ujId) continue;
      if (eredeti) await api.delete(`/api/family-links/${eredeti.linkId}`);
      if (ujId) await api.post("/api/family-links", { parentId: ujId, childId: person.id });
    }
    // Új házastárs (házasság rögzítése)
    if (hazastarsId || kulsoNev.trim()) {
      await api.post("/api/marriages", {
        spouseAId: person.id,
        kulso: !hazastarsId,
        ...(hazastarsId ? { spouseBId: hazastarsId } : { kulsoHazastarsNeve: kulsoNev.trim() }),
        datuma: hazassagDatum || null,
      });
    }
    // Gyerekei
    const eredetiGyerekek = person.csalad.gyermekek;
    for (const g of eredetiGyerekek) if (!gyerekIds.includes(g.id)) await api.delete(`/api/family-links/${g.linkId}`);
    for (const id of gyerekIds) if (!eredetiGyerekek.some((g) => g.id === id)) await api.post("/api/family-links", { parentId: person.id, childId: id });
  }

  const apaKulonbseg = korkulonbseg(ismertek.find((j) => j.id === apaId), szuletesiDatum);
  const anyaKulonbseg = korkulonbseg(ismertek.find((j) => j.id === anyaId), szuletesiDatum);
  const gyerekFigyelmeztetes = (j: Jelolt) => {
    if (!j.szuletesiDatum || !szuletesiDatum) return null;
    const k = Math.round((new Date(j.szuletesiDatum).getTime() - new Date(szuletesiDatum).getTime()) / (365.25 * 24 * 3600 * 1000));
    return k < 12 ? `${j.vezeteknev} ${j.keresztnev}: ${k} év korkülönbség` : null;
  };
  const figyelmeztetesek = [
    apaKulonbseg !== null && (apaKulonbseg < 12 || apaKulonbseg > 65) ? `Az apa és a gyerek között ${apaKulonbseg} év a korkülönbség - biztos?` : null,
    anyaKulonbseg !== null && (anyaKulonbseg < 12 || anyaKulonbseg > 50) ? `Az anya és a gyerek között ${anyaKulonbseg} év a korkülönbség - biztos?` : null,
    ...gyerekek.map(gyerekFigyelmeztetes),
  ].filter((x): x is string => !!x);

  const szerkesztoUi = (
    <div className="stack" style={{ gap: 12, padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}>
      <h3 style={{ margin: 0 }}>Család</h3>
      <div className="row">
        {tagsag && (
          <div className="field" style={{ minWidth: 180 }}>
            <label>Szerepe a háztartásban</label>
            <select value={szerep} onChange={(e) => setSzerep(e.target.value as SzerepValasztas)}>
              <option value="SZULO">{szerepNev("CSALADFO", person.nem)}</option>
              <option value="GYERMEK">{szerepNev("GYERMEK")}</option>
              <option value="EGYEB">{szerepNev("EGYEB")}</option>
            </select>
          </div>
        )}
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Apja</label>
          <select value={apaId} onChange={(e) => setApaId(e.target.value)}>
            <option value="">— nincs megadva —</option>
            {apak.map((j) => (
              <option key={j.id} value={j.id}>
                {jeloltCimke(j)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Anyja</label>
          <select value={anyaId} onChange={(e) => setAnyaId(e.target.value)}>
            <option value="">— nincs megadva —</option>
            {anyak.map((j) => (
              <option key={j.id} value={j.id}>
                {jeloltCimke(j)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <label style={{ fontWeight: 600 }}>Házastársa</label>
        {person.csalad.hazastarsak.length === 0 ? (
          <span style={{ color: "var(--color-text-muted)" }}>Nincs rögzített házastárs.</span>
        ) : (
          <div className="row">
            {person.csalad.hazastarsak.map((h, i) => (
              <span key={i} className="badge">
                {h.vezeteknev} {h.keresztnev}
                {h.haztartasbol ? " (háztartási szerep alapján)" : h.vege ? " (lezárt házasság)" : ""}
              </span>
            ))}
          </div>
        )}
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Házastárs hozzáadása</label>
            <select value={hazastarsId} onChange={(e) => { setHazastarsId(e.target.value); if (e.target.value) setKulsoNev(""); }}>
              <option value="">— válassz a listából —</option>
              {ismertek
                .filter((j) => !person.csalad.hazastarsak.some((h) => h.id === j.id))
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {jeloltCimke(j)}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>vagy nem gyülekezeti tag neve</label>
            <input value={kulsoNev} onChange={(e) => { setKulsoNev(e.target.value); if (e.target.value) setHazastarsId(""); }} placeholder="pl. Kovács Anna" />
          </div>
          <div className="field" style={{ width: 180 }}>
            <label>Házasságkötés dátuma</label>
            <DateInput value={hazassagDatum} onChange={(e) => setHazassagDatum(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <label style={{ fontWeight: 600 }}>Gyerekei</label>
        {gyerekek.length === 0 && <span style={{ color: "var(--color-text-muted)" }}>Nincs rögzített gyerek.</span>}
        <div className="row">
          {gyerekek.map((g) => (
            <span key={g.id} className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {g.vezeteknev} {g.keresztnev}
              {g.szuletesiDatum ? ` (${g.szuletesiDatum.slice(0, 4)})` : ""}
              <button
                type="button"
                title="Kivétel a gyerekei közül (mentéskor törlődik a kapcsolat)"
                onClick={() => setGyerekIds((ids) => ids.filter((x) => x !== g.id))}
                style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", font: "inherit", padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Gyerek hozzáadása</label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setGyerekIds((ids) => (ids.includes(e.target.value) ? ids : [...ids, e.target.value]));
            }}
          >
            <option value="">— válassz a listából —</option>
            {ismertek
              .filter((j) => !gyerekIds.includes(j.id))
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {jeloltCimke(j)}
                </option>
              ))}
          </select>
        </div>
      </div>
      {figyelmeztetesek.map((f) => (
        <span key={f} style={{ color: "#ffb340", fontSize: "var(--font-size-sm)" }}>
          ⚠ {f}
        </span>
      ))}
      <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        <strong>Automatikusan számított (nem szerkeszthető):</strong> nagyszülők:{" "}
        {person.csalad.nagyszulok.length ? person.csalad.nagyszulok.map((n) => `${n.vezeteknev} ${n.keresztnev}`).join(", ") : "—"}; unokák:{" "}
        {person.csalad.unokak.length ? person.csalad.unokak.map((n) => `${n.vezeteknev} ${n.keresztnev}`).join(", ") : "—"}. Ezek az apa/anya és a gyerekek
        módosításakor mentés után frissülnek.
      </div>
    </div>
  );

  return { szerkesztoUi, alkalmaz };
}
