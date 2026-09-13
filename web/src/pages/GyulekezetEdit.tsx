import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { canEditGyulekezet, isAdmin } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { IconPlus, IconCross, IconWallet, IconChevronRight, IconChevronDown } from "../components/icons";

interface GyulekezetData {
  id: string;
  nev: string;
  publicAddress: string | null;
  codFiscal: string | null;
  romanCim: string | null;
  postaiCim: string | null;
  egyhazmegyeId: string;
  _count: { persons: number; households: number };
}

interface EgyhazmegyeOption {
  id: string;
  nev: string;
  kerulet: { nev: string };
}

interface DuesConfig {
  id: string;
  korhatarTol: number;
  korhatarIg: number;
  osszeg: string;
  ervenyesEttolEv: number;
}

interface GravePriceConfig {
  id: string;
  ervenyessegEv: number;
  osszeg: string;
  ervenyesEttolEv: number;
}

function DuesConfigRow({ config, onChanged, canEdit }: { config: DuesConfig; onChanged: () => void; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [korhatarTol, setKorhatarTol] = useState(String(config.korhatarTol));
  const [korhatarIg, setKorhatarIg] = useState(String(config.korhatarIg));
  const [osszeg, setOsszeg] = useState(config.osszeg);
  const [ervenyesEttolEv, setErvenyesEttolEv] = useState(String(config.ervenyesEttolEv));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/dues-config/${config.id}`, {
        korhatarTol: Number(korhatarTol),
        korhatarIg: Number(korhatarIg),
        osszeg: Number(osszeg),
        ervenyesEttolEv: Number(ervenyesEttolEv),
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nem sikerült menteni");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setError(null);
    try {
      await api.delete(`/api/dues-config/${config.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nem sikerült törölni");
    }
  }

  if (editing) {
    return (
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <input type="number" style={{ width: 85 }} value={korhatarTol} onChange={(e) => setKorhatarTol(e.target.value)} />
          <span>–</span>
          <input type="number" style={{ width: 85 }} value={korhatarIg} onChange={(e) => setKorhatarIg(e.target.value)} />
          <span>év,</span>
          <input type="number" style={{ width: 115 }} value={osszeg} onChange={(e) => setOsszeg(e.target.value)} />
          <span>lej/év, érvényes ettől:</span>
          <input type="number" style={{ width: 95 }} value={ervenyesEttolEv} onChange={(e) => setErvenyesEttolEv(e.target.value)} />
          <button className="btn btn-secondary btn-sm" disabled={saving} onClick={save}>
            Mentés
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
            Mégse
          </button>
        </div>
        {error && <span style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>
          {config.korhatarTol}–{config.korhatarIg} év
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
            {" "}
            · érvényes {config.ervenyesEttolEv}-től
          </span>
        </span>
        <div className="row" style={{ alignItems: "center" }}>
          <strong>{config.osszeg} lej / év</strong>
          {canEdit && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                Szerkesztés
              </button>
              <button className="btn btn-secondary btn-sm" onClick={remove}>
                Törlés
              </button>
            </>
          )}
        </div>
      </div>
      {error && <span style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{error}</span>}
    </div>
  );
}

/** Egy `ervenyesEttolEv` szerinti csoportosítás - a lista sorbarendezve érkezik a szervertől
 * (év szerint csökkenő), ezért itt elég csoportokba gyűjteni, nem kell újrarendezni. */
function groupByYear<T extends { ervenyesEttolEv: number }>(items: T[]): { year: number; items: T[] }[] {
  const groups: { year: number; items: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.year === item.ervenyesEttolEv) last.items.push(item);
    else groups.push({ year: item.ervenyesEttolEv, items: [item] });
  }
  return groups;
}

/** Egy teljes korsáv-készlet (évjárat) átmásolása egy új évre - így nem kell évente egyenként
 * újra begépelni ugyanazokat a korhatárokat, csak az összegeket kell utólag, soronként igazítani. */
function CopyYearForm({
  gyulekezetId,
  sourceItems,
  onDone,
  onCancel,
}: {
  gyulekezetId: string;
  sourceItems: DuesConfig[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [targetYear, setTargetYear] = useState(String(sourceItems[0].ervenyesEttolEv + 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setSaving(true);
    setError(null);
    try {
      for (const c of sourceItems) {
        await api.post(`/api/gyulekezetek/${gyulekezetId}/dues-config`, {
          korhatarTol: c.korhatarTol,
          korhatarIg: c.korhatarIg,
          osszeg: Number(c.osszeg),
          ervenyesEttolEv: Number(targetYear),
        });
      }
      onDone();
    } catch {
      setError("Nem sikerült másolni a korsávokat - lehet, hogy erre az évre már léteznek");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ color: "var(--color-text-muted)" }}>
        A {sourceItems[0].ervenyesEttolEv}-től érvényes mind a(z) {sourceItems.length} korsáv másolása erre az évre:
      </span>
      <input type="number" style={{ width: 95 }} value={targetYear} onChange={(e) => setTargetYear(e.target.value)} />
      <button className="btn btn-secondary btn-sm" disabled={saving} onClick={handleCopy}>
        {saving ? "Másolás..." : "Másolás"}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onCancel}>
        Mégse
      </button>
      {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
    </div>
  );
}

/**
 * Egy évjárat összecsukott állapotban csak az évet és a "teljes" (kedvezmények nélküli,
 * azaz a sávok közül a legmagasabb) díjat mutatja - a mentes/kedvezményes korcsoportok
 * részletei csak kattintásra jelennek meg, hogy egy évjárat egy pillantásra átlátható
 * maradjon, ne az összes korsáv egyszerre zsúfolódjon a képernyőre.
 */
function DuesYearBlock({
  group,
  canEdit,
  onChanged,
}: {
  group: { year: number; items: DuesConfig[] };
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const teljesDij = Math.max(...group.items.map((c) => Number(c.osszeg)));

  return (
    <div
      className="stack"
      style={{ gap: 8, padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="row list-row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "6px 8px",
          background: "none",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span className="row" style={{ alignItems: "center", gap: 10 }}>
          <strong>{group.year}-tól érvényes</strong>
          <span className="badge-sm">{teljesDij} lej/év</span>
          {group.items.length > 1 && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{group.items.length} korsáv</span>}
        </span>
        {expanded ? (
          <IconChevronDown style={{ width: 18, height: 18, color: "var(--color-text-muted)", flexShrink: 0 }} />
        ) : (
          <IconChevronRight style={{ width: 18, height: 18, color: "var(--color-text-muted)", flexShrink: 0 }} />
        )}
      </button>
      {expanded && (
        <div className="stack" style={{ gap: 6 }}>
          {group.items.map((c) => (
            <DuesConfigRow key={c.id} config={c} onChanged={onChanged} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function GravePriceConfigRow({ config, onChanged, canEdit }: { config: GravePriceConfig; onChanged: () => void; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [ervenyessegEv, setErvenyessegEv] = useState(String(config.ervenyessegEv));
  const [osszeg, setOsszeg] = useState(config.osszeg);
  const [ervenyesEttolEv, setErvenyesEttolEv] = useState(String(config.ervenyesEttolEv));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/grave-price-config/${config.id}`, {
        ervenyessegEv: Number(ervenyessegEv),
        osszeg: Number(osszeg),
        ervenyesEttolEv: Number(ervenyesEttolEv),
      });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await api.delete(`/api/grave-price-config/${config.id}`);
    onChanged();
  }

  if (editing) {
    return (
      <div className="row" style={{ alignItems: "center" }}>
        <input type="number" style={{ width: 95 }} value={ervenyessegEv} onChange={(e) => setErvenyessegEv(e.target.value)} />
        <span>év,</span>
        <input type="number" style={{ width: 115 }} value={osszeg} onChange={(e) => setOsszeg(e.target.value)} />
        <span>lej, érvényes ettől:</span>
        <input type="number" style={{ width: 95 }} value={ervenyesEttolEv} onChange={(e) => setErvenyesEttolEv(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={saving} onClick={save}>
          Mentés
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          Mégse
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span>
        {config.ervenyessegEv} év érvényesség
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          {" "}
          · érvényes {config.ervenyesEttolEv}-től
        </span>
      </span>
      <div className="row" style={{ alignItems: "center" }}>
        <strong>{config.osszeg} lej</strong>
        {canEdit && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Szerkesztés
            </button>
            <button className="btn btn-secondary btn-sm" onClick={remove}>
              Törlés
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function GyulekezetEdit() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [gyulekezet, setGyulekezet] = useState<GyulekezetData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duesConfigs, setDuesConfigs] = useState<DuesConfig[]>([]);
  const [gravePriceConfigs, setGravePriceConfigs] = useState<GravePriceConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [alapadatokNyitva, setAlapadatokNyitva] = useState(false);

  const [nev, setNev] = useState("");
  const [cim, setCim] = useState("");
  const [codFiscal, setCodFiscal] = useState("");
  const [romanCim, setRomanCim] = useState("");
  const [postaiCim, setPostaiCim] = useState("");
  const [egyhazmegyeId, setEgyhazmegyeId] = useState("");
  const [egyhazmegyek, setEgyhazmegyek] = useState<EgyhazmegyeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [duesOsszeg, setDuesOsszeg] = useState("");
  const [duesKorhatarTol, setDuesKorhatarTol] = useState("18");
  const [duesKorhatarIg, setDuesKorhatarIg] = useState("120");
  const [duesErvenyesEttolEv, setDuesErvenyesEttolEv] = useState(String(new Date().getFullYear()));
  const [showManualDues, setShowManualDues] = useState(false);
  const [showCopyYear, setShowCopyYear] = useState(false);

  const [sirOsszeg, setSirOsszeg] = useState("");
  const [sirEv, setSirEv] = useState("25");
  const [sirErvenyesEttolEv, setSirErvenyesEttolEv] = useState(String(new Date().getFullYear()));

  function load() {
    if (!id) return;
    api
      .get<GyulekezetData>(`/api/gyulekezetek/${id}`)
      .then((g) => {
        setGyulekezet(g);
        setNev(g.nev);
        setCim(g.publicAddress ?? "");
        setCodFiscal(g.codFiscal ?? "");
        setRomanCim(g.romanCim ?? "");
        setPostaiCim(g.postaiCim ?? "");
        setEgyhazmegyeId(g.egyhazmegyeId ?? "");
      })
      .catch(() => setError("Nem sikerült betölteni a gyülekezet adatait"));
    api
      .get<{ duesConfigs: DuesConfig[]; gravePriceConfigs: GravePriceConfig[] }>(`/api/gyulekezetek/${id}/beallitasok`)
      .then((d) => {
        setDuesConfigs(d.duesConfigs);
        setGravePriceConfigs(d.gravePriceConfigs);
      })
      .catch(() => {});
    api.get<EgyhazmegyeOption[]>("/api/egyhazmegyek").then(setEgyhazmegyek).catch(() => {});
  }

  useEffect(load, [id]);

  async function saveBasic(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put(`/api/gyulekezetek/${id}`, {
        nev,
        egyhazmegyeId,
        publicAddress: cim || null,
        codFiscal: codFiscal || null,
        romanCim: romanCim || null,
        postaiCim: postaiCim || null,
      });
      setSaved(true);
      load();
    } catch {
      setError("Nem sikerült menteni");
    } finally {
      setSaving(false);
    }
  }

  async function addDues() {
    if (!id || !duesOsszeg) return;
    await api.post(`/api/gyulekezetek/${id}/dues-config`, {
      korhatarTol: Number(duesKorhatarTol),
      korhatarIg: Number(duesKorhatarIg),
      osszeg: Number(duesOsszeg),
      ervenyesEttolEv: Number(duesErvenyesEttolEv),
    });
    setDuesOsszeg("");
    load();
  }

  const duesYearGroups = useMemo(() => groupByYear(duesConfigs), [duesConfigs]);

  async function addSir() {
    if (!id || !sirOsszeg) return;
    await api.post(`/api/gyulekezetek/${id}/grave-price-config`, {
      ervenyessegEv: Number(sirEv),
      osszeg: Number(sirOsszeg),
      ervenyesEttolEv: Number(sirErvenyesEttolEv),
    });
    setSirOsszeg("");
    load();
  }

  const sirYearGroups = useMemo(() => groupByYear(gravePriceConfigs), [gravePriceConfigs]);

  async function handleDelete() {
    if (!id || !gyulekezet) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.delete(`/api/gyulekezetek/${id}`, { megerositesNev: deleteConfirmText });
      navigate("/gyulekezetek");
    } catch {
      setDeleteError("A törlés nem sikerült. Ellenőrizze, hogy pontosan a gyülekezet nevét írta-e be.");
    } finally {
      setDeleting(false);
    }
  }

  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!gyulekezet) return <p>Betöltés...</p>;

  const canEdit = canEditGyulekezet(user, gyulekezet.id);
  const admin = isAdmin(user);

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <Link to="/gyulekezetek">&larr; Vissza a gyülekezetekhez</Link>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>{gyulekezet.nev}</h1>

      {canEdit ? (
        <div className="card stack">
          <button
            type="button"
            className="row"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", alignItems: "center", gap: 6, color: "inherit" }}
            onClick={() => setAlapadatokNyitva((v) => !v)}
          >
            {alapadatokNyitva ? <IconChevronDown style={{ width: 18, height: 18 }} /> : <IconChevronRight style={{ width: 18, height: 18 }} />}
            <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Alapadatok</h2>
            {!alapadatokNyitva && (
              <span style={{ color: "var(--color-text-muted)", fontWeight: 400, fontSize: "var(--font-size-sm)" }}>
                — {nev}
              </span>
            )}
          </button>
          {alapadatokNyitva && (
            <form onSubmit={saveBasic} className="stack">
              <div className="field">
                <label>Gyülekezet neve</label>
                <input required value={nev} onChange={(e) => setNev(e.target.value)} />
              </div>
              <div className="field">
                <label>Cím</label>
                <input value={cim} onChange={(e) => setCim(e.target.value)} />
              </div>
              <div className="field">
                <label>Postacím (irányítószámmal, hivatalos iratokhoz)</label>
                <input value={postaiCim} onChange={(e) => setPostaiCim(e.target.value)} placeholder="pl. 517261 Bucerdea Grânoasă, Petőfi Sándor 4, Jud. Alba" />
              </div>
              <div className="field">
                <label>Cím románul (a román nyelvű iratokhoz)</label>
                <input value={romanCim} onChange={(e) => setRomanCim(e.target.value)} placeholder="pl. Bucerdea Grânoasă, str. Petőfi Sándor nr. 4, jud. Alba" />
              </div>
              <div className="field">
                <label>Adószám (Cod fiscal / C.U.I.)</label>
                <input value={codFiscal} onChange={(e) => setCodFiscal(e.target.value)} placeholder="pl. 10341226" />
              </div>
              <div className="field">
                <label>Egyházmegye</label>
                <select value={egyhazmegyeId} onChange={(e) => setEgyhazmegyeId(e.target.value)}>
                  <option value="">— nincs kiválasztva —</option>
                  {egyhazmegyek.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.nev} — {em.kerulet.nev}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn" type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
                {saved ? "Mentve ✓" : saving ? "Mentés..." : "Mentés"}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="card stack">
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Alapadatok</h2>
          <div>
            <strong>Cím:</strong> {gyulekezet.publicAddress ?? "—"}
          </div>
          <div>
            <strong>{gyulekezet._count.persons} személy, {gyulekezet._count.households} háztartás</strong>
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="row" style={{ alignItems: "center", gap: 14 }}>
          <div className="icon-tile icon-tile--green">
            <IconWallet style={{ width: 22, height: 22 }} />
          </div>
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Egyházfenntartó díj</h2>
        </div>
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          Korsávok és a hozzájuk tartozó éves összeg (0 lej = mentesség), évjáratonként csoportosítva - minden
          évjárat attól az évtől érvényes, amíg egy újabbat fel nem vesz. Amelyik korra egy évjáratban nincs sáv
          megadva, azt a rendszer mentesnek tekinti.
        </p>
        {duesConfigs.length === 0 && <p style={{ margin: 0 }}>Még nincs beállítva díjszabás.</p>}
        <div className="stack" style={{ gap: 10 }}>
          {duesYearGroups.map((g) => (
            <DuesYearBlock key={g.year} group={g} canEdit={canEdit} onChanged={load} />
          ))}
        </div>
        {canEdit && (
          <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
            {duesYearGroups.length > 0 &&
              (showCopyYear ? (
                <CopyYearForm
                  gyulekezetId={id!}
                  sourceItems={duesYearGroups[0].items}
                  onDone={() => {
                    setShowCopyYear(false);
                    load();
                  }}
                  onCancel={() => setShowCopyYear(false)}
                />
              ) : (
                <button className="btn btn-secondary" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setShowCopyYear(true)}>
                  <IconPlus style={{ width: 16, height: 16 }} /> Másolás a legutóbbi évjáratból új évre
                </button>
              ))}

            {showManualDues ? (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row">
                  <div className="field">
                    <label>Kortól</label>
                    <input type="number" value={duesKorhatarTol} onChange={(e) => setDuesKorhatarTol(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Korig</label>
                    <input type="number" value={duesKorhatarIg} onChange={(e) => setDuesKorhatarIg(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Éves összeg (lej)</label>
                    <input type="number" value={duesOsszeg} onChange={(e) => setDuesOsszeg(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Érvényes ettől (év)</label>
                    <input type="number" value={duesErvenyesEttolEv} onChange={(e) => setDuesErvenyesEttolEv(e.target.value)} />
                  </div>
                </div>
                <div className="row">
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => {
                      addDues();
                      setShowManualDues(false);
                    }}
                    disabled={!duesOsszeg}
                  >
                    Hozzáadás
                  </button>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowManualDues(false)}>
                    Mégse
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-secondary btn-sm" type="button" style={{ alignSelf: "flex-start" }} onClick={() => setShowManualDues(true)}>
                <IconPlus style={{ width: 16, height: 16 }} /> Új korsáv kézzel
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="row" style={{ alignItems: "center", gap: 14 }}>
          <div className="icon-tile icon-tile--graphite">
            <IconCross style={{ width: 22, height: 22 }} />
          </div>
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Sírhelymegváltás díja</h2>
        </div>
        {gravePriceConfigs.length === 0 && <p style={{ margin: 0 }}>Még nincs beállítva díjszabás.</p>}
        <div className="stack" style={{ gap: 10 }}>
          {sirYearGroups.map((g) => (
            <div
              key={g.year}
              className="stack"
              style={{ gap: 8, padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}
            >
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>{g.year}-tól érvényes</strong>
                <span className="badge-sm">{g.items.length} díjszabás</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {g.items.map((c) => (
                  <GravePriceConfigRow key={c.id} config={c} onChanged={load} canEdit={canEdit} />
                ))}
              </div>
            </div>
          ))}
        </div>
        {canEdit && (
          <>
            <div className="row">
              <div className="field">
                <label>Érvényesség (év)</label>
                <input type="number" value={sirEv} onChange={(e) => setSirEv(e.target.value)} />
              </div>
              <div className="field">
                <label>Összeg (lej)</label>
                <input type="number" value={sirOsszeg} onChange={(e) => setSirOsszeg(e.target.value)} />
              </div>
              <div className="field">
                <label>Érvényes ettől (év)</label>
                <input type="number" value={sirErvenyesEttolEv} onChange={(e) => setSirErvenyesEttolEv(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={addSir} disabled={!sirOsszeg} style={{ alignSelf: "flex-start" }}>
              Új díjszabás hozzáadása
            </button>
          </>
        )}
      </div>

      {admin && (
        <div className="card stack" style={{ borderColor: "var(--color-danger)" }}>
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0, color: "var(--color-danger)" }}>Veszélyes zóna</h2>
          <p style={{ margin: 0 }}>
            A gyülekezet törlése <strong>véglegesen és visszavonhatatlanul</strong> eltávolítja az összes hozzá tartozó
            adatot: {gyulekezet._count.persons} személyt, {gyulekezet._count.households} háztartást, minden
            befizetést, anyakönyvi bejegyzést és rokoni kapcsolatot.
          </p>
          {!deleteOpen ? (
            <button className="btn btn-danger" style={{ alignSelf: "flex-start" }} onClick={() => setDeleteOpen(true)}>
              Gyülekezet törlése
            </button>
          ) : (
            <div className="stack">
              <div className="field">
                <label>Írja be a gyülekezet nevét a megerősítéshez: "{gyulekezet.nev}"</label>
                <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
              </div>
              {deleteError && <p style={{ color: "var(--color-danger)" }}>{deleteError}</p>}
              <div className="row">
                <button
                  className="btn btn-danger"
                  disabled={deleting || deleteConfirmText !== gyulekezet.nev}
                  onClick={handleDelete}
                >
                  {deleting ? "Törlés..." : "Véglegesen törlöm"}
                </button>
                <button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                  Mégse
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
