import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { GyulekezetSelect, useGyulekezetek } from "../components/GyulekezetSelect";
import { QuickPay } from "../components/QuickPay";
import { IconDownload } from "../components/icons";
import { DateInput } from "../components/DateInput";
import { memberHighlight, ownGyulekezetIds, canEditGyulekezet, type DuesResult, type Gyulekezet } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { age as calcAge } from "../lib/age";

interface HouseholdMemberTag {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  szerep: string;
  szuletesiDatum: string | null;
  elhunyt: boolean;
  egyhazfenntarto: DuesResult;
  fizetveIdenre: boolean;
  tobbEveElmaradt: boolean;
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

const szerepLabels: Record<string, string> = {
  CSALADFO: "családfő",
  HAZASTARS: "házastárs",
  GYERMEK: "gyermek",
  EGYEB: "egyéb",
};

const FILTER_LABELS: Record<string, (v: string) => string> = {
  elhunyt: (v) => (v === "true" ? "Elhunytak" : "Élő tagok"),
  nem: (v) => (v === "FERFI" ? "Férfiak" : "Nők"),
  korTol: (v) => `${v} évtől`,
  korIg: (v) => `${v} évig`,
  tisztseg: (v) => `Tisztség: ${v}`,
  konfirmalt: () => "Konfirmált",
};

function DuesBadge({ dues }: { dues: DuesResult }) {
  if (dues.korsav === null) return null;
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

export function Households() {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<HouseholdView[]>([]);
  const gyulekezetek = useGyulekezetek();
  // Csak azok a gyülekezetek, amelyekhez a felhasználónak ténylegesen szerkesztési joga van
  // (nem csak esperesként/püspökként látja) - új személy létrehozásakor csak ezek választhatók.
  const editableGyulekezetek = gyulekezetek.filter((g) => canEditGyulekezet(user, g.id));
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const gyulekezetId = searchParams.get("gyulekezetId") ?? "";
  // Ha egy konkrét gyülekezetre van szűrve, az "Új személy hozzáadása" gomb csak akkor
  // jelenjen meg, ha AHHOZ a gyülekezethez van szerkesztési joga (pl. egy esperes, aki csak
  // megtekintésre jogosult egyházmegyei gyülekezeteket böngész, ne kapjon hozzáadás lehetőséget).
  const canAddHere = gyulekezetId ? canEditGyulekezet(user, gyulekezetId) : editableGyulekezetek.length > 0;

  const extraFilterEntries = Array.from(searchParams.entries()).filter(([k]) => k !== "gyulekezetId" && k !== "q");

  function load() {
    const qs = searchParams.toString();
    api
      .get<HouseholdView[]>(`/api/households${qs ? `?${qs}` : ""}`)
      .then(setHouseholds)
      .catch(() => setHouseholds([]));
  }

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function setQ(q: string) {
    setQuery(q);
    const params = new URLSearchParams(searchParams);
    if (q) params.set("q", q);
    else params.delete("q");
    setSearchParams(params);
  }

  function setGyulekezetFilter(id: string) {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("gyulekezetId", id);
    else params.delete("gyulekezetId");
    setSearchParams(params);
  }

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

      <GyulekezetSelect value={gyulekezetId} onChange={setGyulekezetFilter} gyulekezetek={gyulekezetek} />

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
          defaultGyulekezetId={ownGyulekezetIds(user)[0] ?? editableGyulekezetek[0]?.id ?? ""}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="search">Keresés név vagy cím szerint</label>
        <input id="search" value={query} onChange={(e) => setQ(e.target.value)} placeholder="pl. Kovács, vagy Fő utca" />
      </div>

      {households.length === 0 && <p>Nincs találat.</p>}
      <div className="stack">
        {households.map((h) => {
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
                    <span style={{ color: "var(--color-text-muted)", fontWeight: 400, fontSize: "var(--font-size-sm)" }}>
                      — a teljes család megtekintése →
                    </span>
                  </div>
                </Link>
                <div className="row">
                  {h.tobbCsaladEzenACimen && (
                    <span className="badge">Több család ezen a címen</span>
                  )}
                </div>
              </div>
              <div className="stack">
                {h.tagok.map((t) => {
                  const age = calcAge(t.szuletesiDatum);
                  const color = memberHighlight(t.egyhazfenntarto, t.tobbEveElmaradt);
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
                        {t.vezeteknev} {t.keresztnev}
                        {t.fizetveIdenre && (
                          <span title="Idén már fizetett" style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                            {" "}
                            ✓
                          </span>
                        )}
                        {age !== null && <span style={{ color: "var(--color-text-muted)" }}> ({age} év)</span>}{" "}
                        {t.elhunyt && <span style={{ color: "var(--color-danger)" }}>(elhunyt) </span>}
                        <span style={{ color: "var(--color-text-muted)" }}>({szerepLabels[t.szerep] ?? t.szerep})</span>
                        <DuesBadge dues={t.egyhazfenntarto} />
                        {t.tobbEveElmaradt && (
                          <span style={{ color: "var(--color-danger)", fontWeight: 700, fontSize: "var(--font-size-sm)" }}>
                            {" "}
                            · több éve elmaradt
                          </span>
                        )}
                      </Link>
                      {!t.elhunyt && canEdit && (
                        <QuickPay personId={t.id} defaultOsszeg={t.egyhazfenntarto.esedekesOsszeg} fizetveIdenre={t.fizetveIdenre} />
                      )}
                      {!t.elhunyt && !canEdit && t.fizetveIdenre && (
                        <span className="badge-sm" style={{ borderColor: "var(--color-primary)", color: "var(--color-primary-dark)" }}>
                          ✓ Befizetve
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
    </div>
  );
}

function NewPersonForm({
  gyulekezetek,
  defaultGyulekezetId,
  onCreated,
}: {
  gyulekezetek: Gyulekezet[];
  defaultGyulekezetId: string;
  onCreated: () => void;
}) {
  const [vezeteknev, setVezeteknev] = useState("");
  const [keresztnev, setKeresztnev] = useState("");
  const [nem, setNem] = useState<"FERFI" | "NO">("FERFI");
  const [szuletesiDatum, setSzuletesiDatum] = useState("");
  const [szuletesiHely, setSzuletesiHely] = useState("");
  const [vallas, setVallas] = useState("");
  const [gyulekezetId, setGyulekezetId] = useState(defaultGyulekezetId);

  const [vanKereszteles, setVanKereszteles] = useState(false);
  const [keresztelesDatum, setKeresztelesDatum] = useState("");
  const [keresztelesHelye, setKeresztelesHelye] = useState("");

  const [vanKonfirmacio, setVanKonfirmacio] = useState(false);
  const [konfirmacioDatum, setKonfirmacioDatum] = useState("");
  const [konfirmacioHelye, setKonfirmacioHelye] = useState("");

  const [vanKoltozes, setVanKoltozes] = useState(false);
  const [koltozottHonnan, setKoltozottHonnan] = useState("");

  const [vanTisztseg, setVanTisztseg] = useState(false);
  const [tisztseg, setTisztseg] = useState("PRESBITER");

  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/persons", {
        vezeteknev,
        keresztnev,
        nem,
        szuletesiDatum: szuletesiDatum || null,
        szuletesiHely: szuletesiHely || null,
        vallas: vallas || null,
        gyulekezetId,
        ...(vanKereszteles && keresztelesDatum
          ? { kereszteles: { datuma: keresztelesDatum, helye: keresztelesHelye || null } }
          : {}),
        ...(vanKonfirmacio && konfirmacioDatum
          ? { konfirmacio: { datuma: konfirmacioDatum, helye: konfirmacioHelye || null } }
          : {}),
        ...(vanKoltozes && koltozottHonnan ? { koltozottHonnan } : {}),
        ...(vanTisztseg ? { tisztseg } : {}),
      });
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni a személyt");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Az új személy létrehozás után még nincs háztartáshoz rendelve — ezt a háztartás adatlapján, vagy Excel
        importtal lehet elvégezni.
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

      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={vanKereszteles} onChange={(e) => setVanKereszteles(e.target.checked)} />
        Keresztelés rögzítése
      </label>
      {vanKereszteles && (
        <div className="row">
          <div className="field">
            <label>Keresztelés dátuma</label>
            <DateInput value={keresztelesDatum} onChange={(e) => setKeresztelesDatum(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Helye</label>
            <input value={keresztelesHelye} onChange={(e) => setKeresztelesHelye(e.target.value)} />
          </div>
        </div>
      )}

      <label className="row" style={{ fontWeight: 600 }}>
        <input type="checkbox" checked={vanKonfirmacio} onChange={(e) => setVanKonfirmacio(e.target.checked)} />
        Konfirmáció rögzítése
      </label>
      {vanKonfirmacio && (
        <div className="row">
          <div className="field">
            <label>Konfirmáció dátuma</label>
            <DateInput value={konfirmacioDatum} onChange={(e) => setKonfirmacioDatum(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Helye</label>
            <input value={konfirmacioHelye} onChange={(e) => setKonfirmacioHelye(e.target.value)} />
          </div>
        </div>
      )}

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
      <button className="btn" type="submit">
        Mentés
      </button>
    </form>
  );
}
