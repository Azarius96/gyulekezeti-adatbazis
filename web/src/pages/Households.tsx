import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useGyulekezetek } from "../components/GyulekezetSelect";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";
import { QuickPay } from "../components/QuickPay";
import { useReloadOnPayment } from "../context/PaymentSessionContext";
import { IconDownload } from "../components/icons";
import { DateInput } from "../components/DateInput";
import { PageLoader } from "../components/Loading";
import { memberHighlight, reszfizetesSzoveg, CSALADI_ALLAPOT_NEVEK, type CsaladiAllapot, ownGyulekezetIds, canEditGyulekezet, tartozasSzoveg, type TartozasEv, type DuesResult, type Gyulekezet } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { age as calcAge } from "../lib/age";
import { SzerepKerdes, type SzerepKerdesAdat, type HaztartasiSzerep } from "../components/SzerepKerdes";
import { MezoLista, KERESZTELES_MEZOK, KONFIRMACIO_MEZOK, uresErtekek, torzsBol } from "../components/AnyakonyviMezok";
import { szemelyNev, szuletesiSorrend } from "../lib/nev";
import { RENDEZESEK, szurRendez, legidosebbTag, legfiatalabbTag, szemelyRangsor, type SzuroBeallitas, type Rendezes } from "../lib/haztartasSzuro";

interface HouseholdMemberTag {
  id: string;
  vezeteknev: string;
  csaladiAllapot?: CsaladiAllapot | null;
  keresztnev: string;
  vallas?: string | null;
  nem: "FERFI" | "NO";
  szerep: string;
  szuletesiDatum: string | null;
  elhunyt: boolean;
  egyhazfenntarto: DuesResult;
  fizetveIdenre: boolean;
  idenFizetett: number;
  reszbenFizetett: boolean;
  idenHianyzo: number;
  egyhazfenntartoBecsult?: boolean;
  tobbEveElmaradt: boolean;
  tartozasOsszeg: number;
  tartozasEvek: TartozasEv[];
}

interface HouseholdView {
  id: string;
  nev: string | null;
  gyulekezetId: string;
  address: { telepules: string; utca: string; hazszam: string; emeletAjto: string | null; iranyitoszam: string | null };
  tobbCsaladEzenACimen: boolean;
  vallasTipus: string;
  tagok: HouseholdMemberTag[];
}

const FILTER_LABELS: Record<string, (v: string) => string> = {
  elhunyt: (v) => (v === "true" ? "Elhunytak" : "Élő tagok"),
  nem: (v) => (v === "FERFI" ? "Férfiak" : "Nők"),
  korTol: (v) => `${v} évtől`,
  korIg: (v) => `${v} évig`,
  tisztseg: (v) => `Tisztség: ${v}`,
  konfirmalt: () => "Konfirmált",
  rendez: (v) => `Rendezés: ${RENDEZESEK.find((r) => r.id === v)?.cimke ?? v}`,
  kisk: (v) => (v === "van" ? "Kiskorúak (18 év alatt)" : "Felnőttek (18 év felett)"),
  idos: () => "70 éves és idősebbek",
  vallas: (v) => `Vallás: ${v}`,
  csall: (v) => `Családi állapot: ${CSALADI_ALLAPOT_NEVEK[v as CsaladiAllapot] ?? v}`,
  hiany: () => "Nincs születési dátuma",
};

/** Ezek a szűrők a böngészőben, a már betöltött listán dolgoznak - nem kerülnek a szerver felé. */
const KLIENS_KULCSOK = ["rendez", "kisk", "idos", "csall", "vallas", "hiany"];

function DuesBadge({ dues, becsult }: { dues: DuesResult; becsult?: boolean }) {
  if (dues.korsav === null) {
    if (!becsult || !dues.esedekesOsszeg) return null;
    return (
      <span style={{ color: "var(--color-primary-dark)", fontSize: "var(--font-size-sm)" }} title="Nincs születési dátum - az általános díjszabás szerinti összeg">
        {" "}
        · {dues.esedekesOsszeg} lej/év (általános díj)
      </span>
    );
  }
  if (dues.mentes) {
    return <span style={{ color: "#3dd873", fontWeight: 600, fontSize: "var(--font-size-sm)" }}> · mentes</span>;
  }
  if (dues.kedvezmenyes) {
    return (
      <span style={{ color: "#ffb340", fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
        {" "}
        · kedvezményes: {dues.esedekesOsszeg} lej/év
      </span>
    );
  }
  return (
    <span style={{ color: "var(--color-primary-dark)", fontSize: "var(--font-size-sm)" }}>
      {" "}
      · {dues.esedekesOsszeg} lej/év
    </span>
  );
}

const BETOLTES_IDOKORLAT_MS = 15000;

const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => HTML_ESC[c]);

/** A szűrt háztartások nyomtatható (PDF-be menthető) kimutatása: háztartásonként csoportosítva név, cím, születési dátum, életkor. */
function korosztalyPdf(households: HouseholdView[], cim: string, gyulekezetNev: string) {
  const fmt = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, ". ") + "." : "—");
  const sorok = households
    .map((h) => {
      const addr = `${h.address.iranyitoszam ? h.address.iranyitoszam + " " : ""}${h.address.telepules}, ${h.address.utca} ${h.address.hazszam}${h.address.emeletAjto ? `, ${h.address.emeletAjto}` : ""}`;
      const tagok = szuletesiSorrend(h.tagok, (t) => t.szuletesiDatum, (t) => szemelyNev(t))
        .map((t) => {
          const kor = calcAge(t.szuletesiDatum);
          return `<tr><td>${esc(`${szemelyNev(t)}`)}</td><td>${esc(addr)}</td><td>${fmt(t.szuletesiDatum)}</td><td class="r">${kor === null ? "—" : kor + " év"}</td></tr>`;
        })
        .join("");
      return `<tbody><tr class="hh"><td colspan="4">${esc(h.nev ? `${h.nev} — ${addr}` : addr)} · ${h.tagok.length} fő</td></tr>${tagok}</tbody>`;
    })
    .join("");
  const osszes = households.reduce((a, h) => a + h.tagok.length, 0);
  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${esc(cim)}</title><style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
    h1 { font-size: 16px; margin: 0 0 2px; } p { margin: 0 0 8px; color: #444; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; border-bottom: 1.5px solid #000; padding: 3px 4px; }
    td { padding: 2px 4px; border-bottom: 1px solid #ddd; vertical-align: top; } .r { text-align: right; white-space: nowrap; }
    tr.hh td { background: #eee; font-weight: bold; border-bottom: 1px solid #999; padding-top: 4px; }
    tbody { break-inside: avoid; }
  </style></head><body>
    <h1>${esc(cim)}</h1>
    <p>${gyulekezetNev ? esc(gyulekezetNev) + " · " : ""}${osszes} fő, ${households.length} háztartás · Kelt: ${fmt(new Date().toISOString())}</p>
    <table><thead><tr><th>Név</th><th>Cím</th><th>Születési dátum</th><th class="r">Életkor</th></tr></thead>${sorok}</table>
  </body></html>`;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { frame.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow;
  win.onafterprint = () => frame.remove();
  setTimeout(() => { win.focus(); win.print(); }, 200);
}

export function Households() {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<HouseholdView[]>([]);
  // Betöltés közben vázlat (skeleton) látszik; "Nincs találat" csak akkor, ha a betöltés lefutott üresen, vagy ha
  // BETOLTES_IDOKORLAT_MS alatt nem érkezett válasz.
  const [betolt, setBetolt] = useState(true);
  const gyulekezetek = useGyulekezetek();
  // Csak azok a gyülekezetek, amelyekhez a felhasználónak ténylegesen szerkesztési joga van
  // (nem csak esperesként/püspökként látja) - új személy létrehozásakor csak ezek választhatók.
  const editableGyulekezetek = gyulekezetek.filter((g) => canEditGyulekezet(user, g.id));
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useSelectedGyulekezet();
  const urlGyulekezetId = searchParams.get("gyulekezetId");
  // Az URL-ben megadott gyülekezet (pl. mélylinkből) elsőbbséget élvez és átveszi a globális
  // választást; ha nincs az URL-ben, a globálisan kiválasztott gyülekezet érvényes.
  const gyulekezetId = selectedId || urlGyulekezetId || "";
  // Ha egy konkrét gyülekezetre van szűrve, az "Új személy hozzáadása" gomb csak akkor
  // jelenjen meg, ha AHHOZ a gyülekezethez van szerkesztési joga (pl. egy esperes, aki csak
  // megtekintésre jogosult egyházmegyei gyülekezeteket böngész, ne kapjon hozzáadás lehetőséget).
  const canAddHere = gyulekezetId ? canEditGyulekezet(user, gyulekezetId) : editableGyulekezetek.length > 0;

  const extraFilterEntries = Array.from(searchParams.entries()).filter(([k]) => k !== "gyulekezetId" && k !== "q");

  const loadRequestId = useRef(0);

  function load() {
    const effectiveParams = new URLSearchParams(searchParams);
    if (gyulekezetId) effectiveParams.set("gyulekezetId", gyulekezetId);
    else effectiveParams.delete("gyulekezetId");
    for (const k of KLIENS_KULCSOK) effectiveParams.delete(k);
    const qs = effectiveParams.toString();
    const requestId = ++loadRequestId.current;
    setBetolt(true);
    const idokorlat = window.setTimeout(() => {
      if (requestId === loadRequestId.current) setBetolt(false);
    }, BETOLTES_IDOKORLAT_MS);
    api
      .get<HouseholdView[]>(`/api/households${qs ? `?${qs}` : ""}`)
      .then((rows) => requestId === loadRequestId.current && setHouseholds(rows))
      .catch(() => requestId === loadRequestId.current && setHouseholds([]))
      .finally(() => {
        window.clearTimeout(idokorlat);
        if (requestId === loadRequestId.current) setBetolt(false);
      });
  }

  useReloadOnPayment(load);

  // Csak a szervert érintő paraméterek változása tölti újra a listát (a kliensoldali szűrők/rendezés azonnal érvényesül).
  const szerverParamKulcs = (() => {
    const p = new URLSearchParams(searchParams);
    for (const k of KLIENS_KULCSOK) p.delete(k);
    return p.toString();
  })();
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [szerverParamKulcs, selectedId]);

  // A bal oldali gyülekezet-választó váltása azonnal átírja az URL-t (és a listát); egy másik oldalról
  // érkező mélylink (URL-ben megadott gyülekezet) viszont átveszi a globális választást.
  const prevSelected = useRef(selectedId);
  const firstSync = useRef(true);
  useEffect(() => {
    const selectionChanged = prevSelected.current !== selectedId;
    prevSelected.current = selectedId;
    const first = firstSync.current;
    firstSync.current = false;
    if (selectionChanged && !first) {
      if ((urlGyulekezetId ?? "") !== selectedId) {
        const params = new URLSearchParams(searchParams);
        if (selectedId) params.set("gyulekezetId", selectedId);
        else params.delete("gyulekezetId");
        setSearchParams(params, { replace: true });
      }
    } else if (urlGyulekezetId !== null) {
      if (urlGyulekezetId !== selectedId) setSelectedId(urlGyulekezetId);
    } else if (selectedId) {
      const params = new URLSearchParams(searchParams);
      params.set("gyulekezetId", selectedId);
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlGyulekezetId, selectedId]);

  function setQ(q: string) {
    setQuery(q);
    const params = new URLSearchParams(searchParams);
    if (q) params.set("q", q);
    else params.delete("q");
    setSearchParams(params);
  }

  // Korosztály szerinti szűrő: a megadott életkor-tartomány (évtől-évig) szerinti élő tagok; a találatot meg is számoljuk.
  const korTol = searchParams.get("korTol") ?? "";
  const korIg = searchParams.get("korIg") ?? "";
  function setKor(kulcs: "korTol" | "korIg", ertek: string) {
    const params = new URLSearchParams(searchParams);
    if (ertek.trim() === "" || Number.isNaN(Number(ertek))) params.delete(kulcs);
    else params.set(kulcs, String(Math.max(0, Math.round(Number(ertek)))));
    // Korosztály szerinti szűrésnél csak az élő tagokat listázzuk
    if (params.has("korTol") || params.has("korIg")) {
      if (!params.has("elhunyt")) params.set("elhunyt", "false");
    } else if (params.get("elhunyt") === "false") {
      params.delete("elhunyt");
    }
    setSearchParams(params);
  }
  const szuro: SzuroBeallitas = {
    rendez: (RENDEZESEK.some((r) => r.id === searchParams.get("rendez")) ? searchParams.get("rendez") : "cim") as Rendezes,
    kisk: (searchParams.get("kisk") ?? "") as SzuroBeallitas["kisk"],
    idos: (searchParams.get("idos") ?? "") as SzuroBeallitas["idos"],
    csall: searchParams.get("csall") ?? "",
    vallas: searchParams.get("vallas") ?? "",
    hiany: (searchParams.get("hiany") ?? "") as SzuroBeallitas["hiany"],
  };
  function setSzuro(kulcs: keyof SzuroBeallitas, ertek: string) {
    const params = new URLSearchParams(searchParams);
    if (!ertek || (kulcs === "rendez" && ertek === "cim")) params.delete(kulcs);
    else params.set(kulcs, ertek);
    setSearchParams(params, { replace: true });
  }
  const lathatoHaztartasok = szurRendez(households, szuro, (t) => calcAge(t.szuletesiDatum));
  const talalatTagok = lathatoHaztartasok.reduce((sum, h) => sum + h.tagok.length, 0);
  const [szuroNyitva, setSzuroNyitva] = useState(true);
  // Legidősebb/legfiatalabb rendezésnél személyek rangsora (háztartásokon átívelően), nem háztartás-kártyák.
  const rangsorMod = szuro.rendez === "legidosebb" || szuro.rendez === "legfiatalabb";
  const rangsor = rangsorMod ? szemelyRangsor<HouseholdMemberTag, HouseholdView>(lathatoHaztartasok, szuro.rendez === "legidosebb") : [];
  const datumNelkuliek = rangsorMod ? lathatoHaztartasok.reduce((n, h) => n + h.tagok.filter((t) => !t.elhunyt && !t.szuletesiDatum).length, 0) : 0;
  const kliensSzuroAktiv = KLIENS_KULCSOK.some((k) => searchParams.has(k));

  function clearExtraFilters() {
    const params = new URLSearchParams();
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    if (query) params.set("q", query);
    setSearchParams(params);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Háztartások</h1>
        <div className="row">
          <Link className="btn btn-secondary" to="/dokumentumok" title="Excel export, választói névjegyzék, személyi adatlapok">
            <IconDownload style={{ width: 18, height: 18 }} /> Letölthető dokumentumok
          </Link>
          {canAddHere && (
            <button className="btn" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Mégse" : "Új személy hozzáadása"}
            </button>
          )}
        </div>
      </div>

      {extraFilterEntries.length > 0 && (
        <div className="row" style={{ alignItems: "center" }}>
          <span style={{ color: "var(--color-text-muted)" }}>Aktív szűrők:</span>
          {extraFilterEntries.map(([k, v]) => (
            <span key={k} className="badge">
              {(FILTER_LABELS[k] ?? ((val: string) => `${k}: ${val}`))(v)}
            </span>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={clearExtraFilters}>
            Szűrők törlése
          </button>
        </div>
      )}

      {showForm && (
        <NewPersonForm
          gyulekezetek={editableGyulekezetek}
          defaultGyulekezetId={(gyulekezetId && editableGyulekezetek.some((g) => g.id === gyulekezetId) ? gyulekezetId : "") || (ownGyulekezetIds(user)[0] ?? editableGyulekezetek[0]?.id ?? "")}
          cimJavaslatok={{
            telepulesek: Array.from(new Set(households.map((h) => h.address.telepules))).sort(),
            utcak: Array.from(new Set(households.map((h) => h.address.utca))).sort(),
          }}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, minWidth: 240, maxWidth: 420 }}>
          <label htmlFor="search">Keresés név vagy cím szerint</label>
          <input id="search" value={query} onChange={(e) => setQ(e.target.value)} placeholder="pl. Kovács, vagy Fő utca" />
        </div>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="kor-tol">Életkor-tól (év)</label>
          <input id="kor-tol" type="number" min="0" inputMode="numeric" value={korTol} onChange={(e) => setKor("korTol", e.target.value)} placeholder="pl. 18" />
        </div>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="kor-ig">Életkor-ig (év)</label>
          <input id="kor-ig" type="number" min="0" inputMode="numeric" value={korIg} onChange={(e) => setKor("korIg", e.target.value)} placeholder="pl. 35" />
        </div>
      </div>

      <div className="card" style={{ padding: "12px 16px", borderColor: "var(--color-primary)" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setSzuroNyitva((v) => !v)}
          aria-expanded={szuroNyitva}
          style={{ fontWeight: 700 }}
        >
          Szűrők és rendezés {szuroNyitva ? "▾" : "▸"}
          {kliensSzuroAktiv && (
            <span className="badge" style={{ marginLeft: 8, background: "var(--color-primary)", color: "#fff" }}>
              {KLIENS_KULCSOK.filter((k) => searchParams.has(k)).length} aktív
            </span>
          )}
        </button>
        {szuroNyitva && (
        <div className="row" style={{ marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 260 }}>
            <label htmlFor="rendez">Rendezés</label>
            <select id="rendez" value={szuro.rendez} onChange={(e) => setSzuro("rendez", e.target.value)}>
              {RENDEZESEK.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.cimke}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 170 }}>
            <label htmlFor="kisk">Életkor szerint</label>
            <select id="kisk" value={szuro.kisk} onChange={(e) => setSzuro("kisk", e.target.value)}>
              <option value="">Mind</option>
              <option value="van">Csak a kiskorúak (18 év alatt)</option>
              <option value="nincs">Csak a felnőttek (18 év felett)</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 170 }}>
            <label htmlFor="idos">Idősek</label>
            <select id="idos" value={szuro.idos} onChange={(e) => setSzuro("idos", e.target.value)}>
              <option value="">Mind</option>
              <option value="van">Csak a 70 éves és idősebbek</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 190 }}>
            <label htmlFor="vallas">Vallás</label>
            <select id="vallas" value={szuro.vallas} onChange={(e) => setSzuro("vallas", e.target.value)}>
              <option value="">Mind</option>
              {Array.from(new Set(households.flatMap((h) => h.tagok.map((t) => (t.vallas ?? "").trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, "hu")).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 190 }}>
            <label htmlFor="csall">Családi állapot</label>
            <select id="csall" value={szuro.csall} onChange={(e) => setSzuro("csall", e.target.value)}>
              <option value="">Mind</option>
              {(Object.keys(CSALADI_ALLAPOT_NEVEK) as CsaladiAllapot[]).map((k) => (
                <option key={k} value={k}>
                  {CSALADI_ALLAPOT_NEVEK[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="hiany">Adathiány</label>
            <select id="hiany" value={szuro.hiany} onChange={(e) => setSzuro("hiany", e.target.value)}>
              <option value="">Mind</option>
              <option value="van">Csak akiknek hiányzik a születési dátuma</option>
            </select>
          </div>
          {kliensSzuroAktiv && (
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                for (const k of KLIENS_KULCSOK) params.delete(k);
                setSearchParams(params, { replace: true });
              }}
            >
              Alaphelyzet
            </button>
          )}
        </div>
        )}
      </div>

      {(korTol !== "" || korIg !== "") && (
        <div className="row" style={{ alignItems: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {korTol !== "" ? korTol : "0"}–{korIg !== "" ? korIg : "…"} éves élő tagok: {talalatTagok} fő, {lathatoHaztartasok.length} háztartásban
          </p>
          {lathatoHaztartasok.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              title="Megnyílik a nyomtatási ablak - válassza a Mentés PDF-ként lehetőséget"
              onClick={() =>
                korosztalyPdf(
                  lathatoHaztartasok,
                  `${korTol !== "" ? korTol : "0"}–${korIg !== "" ? korIg : "…"} éves tagok`,
                  gyulekezetek.find((g) => g.id === gyulekezetId)?.nev ?? ""
                )
              }
            >
              <IconDownload style={{ width: 16, height: 16 }} /> Letöltés PDF-ben
            </button>
          )}
        </div>
      )}

      {betolt && households.length === 0 && <PageLoader compact />}
      {!betolt && lathatoHaztartasok.length === 0 && <p>Nincs találat.</p>}
      {kliensSzuroAktiv && lathatoHaztartasok.length > 0 && (
        <p style={{ margin: 0, fontWeight: 600 }}>
          {lathatoHaztartasok.length} háztartásban {talalatTagok} személy a szűrők szerint (összesen {households.length} háztartásból)
        </p>
      )}
      {rangsorMod && lathatoHaztartasok.length > 0 && (
        <div className="card stack" style={{ gap: 0, padding: 0 }}>
          <div style={{ padding: "12px 16px", fontWeight: 700, borderBottom: "1px solid var(--color-border)" }}>
            {szuro.rendez === "legidosebb" ? "Legidősebbek rangsora" : "Legfiatalabbak rangsora"} – {rangsor.length} személy
            {datumNelkuliek > 0 && (
              <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> (születési dátum nélkül, kihagyva: {datumNelkuliek})</span>
            )}
          </div>
          {rangsor.map(({ tag, haztartas }, i) => (
            <div key={tag.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--color-border)" }}>
              <span>
                <span style={{ display: "inline-block", minWidth: 40, color: "var(--color-text-muted)", fontWeight: 700 }}>{i + 1}.</span>
                <Link to={`/szemelyek/${tag.id}`} style={{ fontWeight: i === 0 ? 800 : 600 }}>
                  {szemelyNev(tag)}
                </Link>{" "}
                <strong>({calcAge(tag.szuletesiDatum)} év)</strong>
                <span style={{ color: "var(--color-text-muted)" }}>
                  {" "}
                  — {haztartas.address.utca} {haztartas.address.hazszam}
                </span>
              </span>
              <Link to={`/haztartasok/${haztartas.id}`} className="btn btn-secondary btn-sm">
                Háztartás →
              </Link>
            </div>
          ))}
        </div>
      )}
      {!rangsorMod && (
      <div className="stack">
        {lathatoHaztartasok.map((h) => {
          const addressText = `${h.address.iranyitoszam ? h.address.iranyitoszam + " " : ""}${h.address.telepules}, ${h.address.utca} ${h.address.hazszam}${h.address.emeletAjto ? `, ${h.address.emeletAjto}` : ""}`;
          const canEdit = canEditGyulekezet(user, h.gyulekezetId);
          return (
            <div key={h.id} className="card stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <Link to={`/haztartasok/${h.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  {h.nev && <strong style={{ fontSize: "var(--font-size-lg)" }}>{h.nev}</strong>}
                  <div
                    style={{
                      color: h.nev ? "var(--color-text-muted)" : "inherit",
                      fontWeight: h.nev ? 400 : 600,
                      fontSize: h.nev ? "var(--font-size-base)" : "var(--font-size-lg)",
                    }}
                  >
                    {addressText}{" "}
                    {h.vallasTipus === "VEGYES" && (
                      <>
                        <span className="badge" style={{ background: "rgba(255, 159, 10, 0.16)", color: "#ffb340", fontWeight: 600 }}>vegyes vallású család</span>{" "}
                      </>
                    )}
                    <span style={{ color: "var(--color-text-muted)", fontWeight: 400, fontSize: "var(--font-size-sm)" }}>
                      — a teljes család megtekintése →
                    </span>
                  </div>
                </Link>
                <div className="row">
                  {szuro.rendez === "legidosebb" && legidosebbTag(h) && (
                    <span className="badge" style={{ background: "var(--color-primary-light)", color: "var(--color-primary-dark)", fontWeight: 700 }}>
                      Legidősebb: {szemelyNev(legidosebbTag(h)!)} ({calcAge(legidosebbTag(h)!.szuletesiDatum)} év)
                    </span>
                  )}
                  {szuro.rendez === "legfiatalabb" && legfiatalabbTag(h) && (
                    <span className="badge" style={{ background: "var(--color-primary-light)", color: "var(--color-primary-dark)", fontWeight: 700 }}>
                      Legfiatalabb: {szemelyNev(legfiatalabbTag(h)!)} ({calcAge(legfiatalabbTag(h)!.szuletesiDatum)} év)
                    </span>
                  )}
                  {h.tobbCsaladEzenACimen && (
                    <span className="badge">Több család ezen a címen</span>
                  )}
                </div>
              </div>
              <div className="stack">
                {szuletesiSorrend(h.tagok, (t) => t.szuletesiDatum, (t) => szemelyNev(t)).map((t) => {
                  const age = calcAge(t.szuletesiDatum);
                  const color = memberHighlight(t.egyhazfenntarto, t.tobbEveElmaradt, t.reszbenFizetett);
                  return (
                    <div
                      key={t.id}
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: color?.bg ?? "transparent",
                        padding: color ? "4px 10px" : 0,
                        borderRadius: "var(--radius)",
                      }}
                    >
                      <Link
                        to={`/szemelyek/${t.id}`}
                        style={{ textDecoration: "none", color: color?.fg ?? "var(--color-text)" }}
                      >
                        {szemelyNev(t)}
                        {t.fizetveIdenre && (
                          <span title="Idén már fizetett" style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                            {" "}
                            ✓
                          </span>
                        )}
                        {age !== null && <span style={{ color: "var(--color-text-muted)" }}> ({age} év)</span>}{" "}
                        {t.elhunyt && <span style={{ color: "var(--color-danger)" }}>(elhunyt) </span>}
                        {t.csaladiAllapot && <span style={{ color: "var(--color-text-muted)" }}>({CSALADI_ALLAPOT_NEVEK[t.csaladiAllapot]})</span>}
                        <DuesBadge dues={t.egyhazfenntarto} becsult={t.egyhazfenntartoBecsult} />
                        {t.tobbEveElmaradt && (
                          <span style={{ color: "var(--color-danger)", fontWeight: 700, fontSize: "var(--font-size-sm)" }}>
                            {" "}
                            · tartozás: {tartozasSzoveg(t.tartozasOsszeg, t.tartozasEvek)}
                          </span>
                        )}
                        {t.reszbenFizetett && (
                          <span style={{ color: "#ffb340", fontWeight: 700, fontSize: "var(--font-size-sm)" }}>
                            {" "}
                            · {reszfizetesSzoveg(t.idenFizetett, t.egyhazfenntarto.esedekesOsszeg, t.idenHianyzo)}
                          </span>
                        )}
                      </Link>
                      {!t.elhunyt && canEdit && (
                        <QuickPay
                          personId={t.id}
                          nev={`${szemelyNev(t)}`}
                          defaultOsszeg={t.reszbenFizetett ? t.idenHianyzo : t.egyhazfenntarto.esedekesOsszeg}
                          fizetveIdenre={t.fizetveIdenre}
                          reszbenFizetett={t.reszbenFizetett}
                        />
                      )}
                      {!t.elhunyt && !canEdit && t.fizetveIdenre && (
                        <span className="badge-sm" style={{ borderColor: "var(--color-primary)", color: "var(--color-primary-dark)" }}>
                          ✓ Befizetve
                        </span>
                      )}
                      {!t.elhunyt && !canEdit && t.reszbenFizetett && (
                        <span className="badge-sm" style={{ borderColor: "#ffb340", color: "#ffb340" }}>
                          Részben fizetve
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function NewPersonForm({
  gyulekezetek,
  defaultGyulekezetId,
  cimJavaslatok,
  onCreated,
}: {
  gyulekezetek: Gyulekezet[];
  defaultGyulekezetId: string;
  /** A már ismert települések és utcák - az űrlap ezeket ajánlja fel a lakcím beírásakor. */
  cimJavaslatok: { telepulesek: string[]; utcak: string[] };
  onCreated: () => void;
}) {
  const [vezeteknev, setVezeteknev] = useState("");
  const [keresztnev, setKeresztnev] = useState("");
  const [nem, setNem] = useState<"FERFI" | "NO">("FERFI");
  const [szuletesiDatum, setSzuletesiDatum] = useState("");
  const [szuletesiHely, setSzuletesiHely] = useState("");
  const [vallas, setVallas] = useState("");
  const [gyulekezetId, setGyulekezetId] = useState(defaultGyulekezetId);

  const [foglalkozas, setFoglalkozas] = useState("");
  // Anyakönyvi bejegyzések: a papír anyakönyv összes mezője (ld. components/AnyakonyviMezok.tsx)
  const [vanKereszteles, setVanKereszteles] = useState(false);
  const [keresztelesErt, setKeresztelesErt] = useState(() => uresErtekek(KERESZTELES_MEZOK));
  const [vanKonfirmacio, setVanKonfirmacio] = useState(false);
  const [konfirmacioErt, setKonfirmacioErt] = useState(() => uresErtekek(KONFIRMACIO_MEZOK));

  const [vanKoltozes, setVanKoltozes] = useState(false);
  const [koltozottHonnan, setKoltozottHonnan] = useState("");

  const [vanTisztseg, setVanTisztseg] = useState(false);
  const [tisztseg, setTisztseg] = useState("PRESBITER");

  // Lakcím: ha megadod, a személy rögtön a címhez tartozó családba kerül, a szerepét (apa/anya/gyermek...) a rendszer próbálja felismerni
  const [telepules, setTelepules] = useState(cimJavaslatok.telepulesek.length === 1 ? cimJavaslatok.telepulesek[0] : "");
  const [utca, setUtca] = useState("");
  const [hazszam, setHazszam] = useState("");
  const [emeletAjto, setEmeletAjto] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Ha a személy már létrejött, de a címét még nem sikerült rögzíteni (hiba vagy szerep-kérdés), ne hozzuk létre újra
  const [letrehozottId, setLetrehozottId] = useState<string | null>(null);
  const [szerepKerdes, setSzerepKerdes] = useState<{ adat: SzerepKerdesAdat; body: Record<string, unknown> } | null>(null);

  async function cimRogzites(personId: string, body: Record<string, unknown>, szerep?: HaztartasiSzerep) {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ szerepKerdes?: boolean; indok?: string; tagok?: SzerepKerdesAdat["tagok"] }>(`/api/persons/${personId}/cim`, {
        ...body,
        ...(szerep ? { szerep } : {}),
      });
      if (res.szerepKerdes) {
        setSzerepKerdes({ adat: { indok: res.indok ?? "", tagok: res.tagok ?? [] }, body });
        return;
      }
      onCreated();
    } catch {
      setError("A személy létrejött, de a lakcímét nem sikerült rögzíteni - a személy adatlapján pótolható.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const teljesCim = telepules.trim() && utca.trim() && hazszam.trim();
    const cimBody = { telepules: telepules.trim(), utca: utca.trim(), hazszam: hazszam.trim(), emeletAjto: emeletAjto.trim() || null, koltozott: false };
    if (letrehozottId) {
      if (teljesCim) await cimRogzites(letrehozottId, cimBody);
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<{ id: string }>("/api/persons", {
        vezeteknev,
        keresztnev,
        nem,
        szuletesiDatum: szuletesiDatum || null,
        szuletesiHely: szuletesiHely || null,
        vallas: vallas || null,
        gyulekezetId,
        foglalkozas: foglalkozas.trim() || null,
        ...(vanKereszteles && keresztelesErt.datuma ? { kereszteles: torzsBol(KERESZTELES_MEZOK, keresztelesErt) } : {}),
        ...(vanKonfirmacio && konfirmacioErt.datuma ? { konfirmacio: torzsBol(KONFIRMACIO_MEZOK, konfirmacioErt) } : {}),
        ...(vanKoltozes && koltozottHonnan ? { koltozottHonnan } : {}),
        ...(vanTisztseg ? { tisztseg } : {}),
      });
      setLetrehozottId(created.id);
      if (teljesCim) {
        setSaving(false);
        await cimRogzites(created.id, cimBody);
        return;
      }
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni a személyt");
    } finally {
      setSaving(false);
    }
  }

  if (szerepKerdes && letrehozottId) {
    return (
      <div className="card stack">
        <p style={{ margin: 0 }}>
          <strong>{vezeteknev} {keresztnev}</strong> létrejött, a lakcíme: {utca} {hazszam}, {telepules}.
        </p>
        <SzerepKerdes
          nev={`${vezeteknev} ${keresztnev}`}
          nem={nem}
          adat={szerepKerdes.adat}
          foglalt={saving}
          onChoose={(szerep) => cimRogzites(letrehozottId, szerepKerdes.body, szerep)}
          onSkip={onCreated}
          skipFelirat="Később, cím nélkül"
        />
        {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Ha megadod a lakcímet, az új személy a címhez tartozó családba kerül, és a rendszer felismeri, hogy apa, anya vagy gyerek
        (ha nem tudja, megkérdezi). Cím nélkül a személy később is hozzárendelhető egy családhoz.
      </p>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Vezetéknév</label>
          <input required value={vezeteknev} onChange={(e) => setVezeteknev(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Keresztnév</label>
          <input required value={keresztnev} onChange={(e) => setKeresztnev(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Nem</label>
          <select value={nem} onChange={(e) => setNem(e.target.value as "FERFI" | "NO")}>
            <option value="FERFI">Férfi</option>
            <option value="NO">Nő</option>
          </select>
        </div>
        <div className="field">
          <label>Születési dátum</label>
          <DateInput value={szuletesiDatum} onChange={(e) => setSzuletesiDatum(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Születési hely</label>
          <input value={szuletesiHely} onChange={(e) => setSzuletesiHely(e.target.value)} />
        </div>
        <div className="field">
          <label>Vallás</label>
          <input value={vallas} onChange={(e) => setVallas(e.target.value)} placeholder="pl. református" />
        </div>
        <div className="field">
          <label>Foglalkozás</label>
          <input value={foglalkozas} onChange={(e) => setFoglalkozas(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Gyülekezet</label>
          <select value={gyulekezetId} onChange={(e) => setGyulekezetId(e.target.value)}>
            {gyulekezetek.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nev}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Település</label>
          <input list="uj-szemely-telepulesek" value={telepules} onChange={(e) => setTelepules(e.target.value)} />
          <datalist id="uj-szemely-telepulesek">
            {cimJavaslatok.telepulesek.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="field" style={{ flex: 2, minWidth: 200 }}>
          <label>Utca</label>
          <input list="uj-szemely-utcak" value={utca} onChange={(e) => setUtca(e.target.value)} />
          <datalist id="uj-szemely-utcak">
            {cimJavaslatok.utcak.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>Házszám</label>
          <input value={hazszam} onChange={(e) => setHazszam(e.target.value)} />
        </div>
        <div className="field" style={{ width: 130 }}>
          <label>Emelet/ajtó</label>
          <input value={emeletAjto} onChange={(e) => setEmeletAjto(e.target.value)} />
        </div>
      </div>

      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={vanKereszteles} onChange={(e) => setVanKereszteles(e.target.checked)} />
        Keresztelés rögzítése (keresztelési anyakönyv)
      </label>
      {vanKereszteles && <MezoLista defs={KERESZTELES_MEZOK} ertekek={keresztelesErt} onChange={setKeresztelesErt} />}

      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={vanKonfirmacio} onChange={(e) => setVanKonfirmacio(e.target.checked)} />
        Konfirmáció rögzítése (konfirmáltak anyakönyve)
      </label>
      {vanKonfirmacio && <MezoLista defs={KONFIRMACIO_MEZOK} ertekek={konfirmacioErt} onChange={setKonfirmacioErt} />}

      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={vanKoltozes} onChange={(e) => setVanKoltozes(e.target.checked)} />
        Más gyülekezetből költözött ide
      </label>
      {vanKoltozes && (
        <div className="field">
          <label>Honnan költözött</label>
          <input
            value={koltozottHonnan}
            onChange={(e) => setKoltozottHonnan(e.target.value)}
            placeholder="pl. Kolozsvári Református Egyházközség"
          />
        </div>
      )}

      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={vanTisztseg} onChange={(e) => setVanTisztseg(e.target.checked)} />
        Tisztség hozzárendelése
      </label>
      {vanTisztseg && (
        <div className="field" style={{ maxWidth: 300 }}>
          <label>Tisztség</label>
          <select value={tisztseg} onChange={(e) => setTisztseg(e.target.value)}>
            <option value="PRESBITER">Presbiter</option>
            <option value="POTPRESBITER">Pótpresbiter</option>
            <option value="GONDNOK">Gondnok</option>
            <option value="FOGONDNOK">Főgondnok</option>
            <option value="NOSZOVETSEGI_TAG">Nőszövetségi tag</option>
          </select>
        </div>
      )}

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Mentés..." : letrehozottId ? "Lakcím mentése újra" : "Mentés"}
      </button>
    </form>
  );
}
