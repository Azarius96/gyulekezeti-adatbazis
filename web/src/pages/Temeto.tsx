import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { GyulekezetSelect, useGyulekezetek } from "../components/GyulekezetSelect";
import { IconCross, IconMapPin, IconPlus, IconTrash, IconLock, IconLockOpen, IconClock } from "../components/icons";
import { canEditGyulekezet } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { DateInput } from "../components/DateInput";
import {
  LEJARAT_ELORE_JELZES_HONAP,
  type PurchaseData,
  type CemeteryData,
  type ParcellaData,
  type SirhelyData,
} from "../components/AddBurialForm";

interface ExpiringPurchase extends PurchaseData {
  sirhelyJelzes: string;
  parcellaJelzes: string;
  cemeteryNev: string;
  lejartMar: boolean;
}

/** A már betöltött temető-fából (parcella/sírhely/megváltás) kigyűjti azokat a
 * megváltásokat, amelyek lejárata a közeljövőben esedékes vagy már el is telt -
 * nem igényel külön API-hívást, a /api/temeto válasza már tartalmazza a lejárati adatot. */
function collectExpiringPurchases(cemeteries: CemeteryData[]): ExpiringPurchase[] {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + LEJARAT_ELORE_JELZES_HONAP);

  const result: ExpiringPurchase[] = [];
  for (const cemetery of cemeteries) {
    for (const parcella of cemetery.parcellak) {
      for (const sirhely of parcella.sirhelyek) {
        for (const purchase of sirhely.purchases) {
          const lejarat = new Date(purchase.lejarat);
          if (lejarat <= horizon) {
            result.push({
              ...purchase,
              sirhelyJelzes: sirhely.jelzes,
              parcellaJelzes: parcella.jelzes,
              cemeteryNev: cemetery.nev,
              lejartMar: lejarat < now,
            });
          }
        }
      }
    }
  }
  return result.sort((a, b) => new Date(a.lejarat).getTime() - new Date(b.lejarat).getTime());
}

export function Temeto() {
  const { user } = useAuth();
  const gyulekezetek = useGyulekezetek();
  const [searchParams, setSearchParams] = useSearchParams();
  const gyulekezetId = searchParams.get("gyulekezetId") ?? "";

  const [cemeteries, setCemeteries] = useState<CemeteryData[]>([]);
  const [showNewCemetery, setShowNewCemetery] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setGyulekezetFilter(id: string) {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("gyulekezetId", id);
    else params.delete("gyulekezetId");
    setSearchParams(params);
  }

  function loadCemeteries() {
    const params = new URLSearchParams();
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<CemeteryData[]>(`/api/temeto?${params.toString()}`)
      .then(setCemeteries)
      .catch(() => setError("Nem sikerült betölteni a temetőket"));
  }

  useEffect(() => {
    loadCemeteries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyulekezetId]);

  const activeGyulekezetId = gyulekezetId || gyulekezetek[0]?.id || "";
  const expiringPurchases = useMemo(() => collectExpiringPurchases(cemeteries), [cemeteries]);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Temető</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
            Temetői parcellák és sírhelyek kezelése. Az elhunytak temetése a személy adatlapján, az "Áthelyezés a
            temetőbe" gombbal rögzíthető.
          </p>
        </div>
        <GyulekezetSelect value={gyulekezetId} onChange={setGyulekezetFilter} gyulekezetek={gyulekezetek} />
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {expiringPurchases.length > 0 && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="row" style={{ alignItems: "center", gap: 14 }}>
              <div className="icon-tile icon-tile--orange">
                <IconClock style={{ width: 22, height: 22 }} />
              </div>
              <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Lejáró sírhelymegváltások</h2>
            </div>
            <span className="badge">{expiringPurchases.length} sírhely</span>
          </div>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
            A következő {LEJARAT_ELORE_JELZES_HONAP} hónapban lejáró, illetve már lejárt megváltások - érdemes időben
            dönteni a megújításról.
          </p>
          <div className="stack" style={{ gap: 10 }}>
            {expiringPurchases.map((p) => (
              <div
                key={p.id}
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "var(--color-surface-alt)" }}
              >
                <div>
                  <strong>
                    {p.megvaltoPerson ? (
                      <Link to={`/szemelyek/${p.megvaltoPerson.id}`}>{p.megvaltoNeve}</Link>
                    ) : (
                      p.megvaltoNeve
                    )}
                  </strong>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                    {p.cemeteryNev}, {p.parcellaJelzes}/{p.sirhelyJelzes} · lejárat: {p.lejarat.slice(0, 10)}
                  </div>
                </div>
                <span
                  className="badge-sm"
                  style={p.lejartMar ? { borderColor: "var(--color-danger)", color: "var(--color-danger)" } : { borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                >
                  {p.lejartMar ? "lejárt" : "hamarosan lejár"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}


      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Temetők</h2>
          {canEditGyulekezet(user, activeGyulekezetId) && (
            <button className="btn btn-secondary" onClick={() => setShowNewCemetery((v) => !v)}>
              {showNewCemetery ? "Mégse" : (
                <>
                  <IconPlus style={{ width: 18, height: 18 }} /> Új temető
                </>
              )}
            </button>
          )}
        </div>

        {showNewCemetery && (
          <NewCemeteryForm
            gyulekezetId={activeGyulekezetId}
            onCreated={() => {
              setShowNewCemetery(false);
              loadCemeteries();
            }}
          />
        )}

        {cemeteries.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Még nincs felvéve temető.</p>}

        {cemeteries.map((c) => (
          <CemeteryCard key={c.id} cemetery={c} onChanged={loadCemeteries} canEdit={canEditGyulekezet(user, c.gyulekezetId)} />
        ))}
      </div>
    </div>
  );
}

function NewCemeteryForm({ gyulekezetId, onCreated }: { gyulekezetId: string; onCreated: () => void }) {
  const [nev, setNev] = useState("");
  const [cim, setCim] = useState("");
  const [telekkonyvSzam, setTelekkonyvSzam] = useState("");
  const [helyrajziSzam, setHelyrajziSzam] = useState("");
  const [teruletNm, setTeruletNm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gyulekezetId) {
      setError("Nincs kiválasztva gyülekezet");
      return;
    }
    setError(null);
    try {
      await api.post("/api/temeto/cemeteries", {
        gyulekezetId,
        nev,
        cim: cim || null,
        telekkonyvSzam: telekkonyvSzam || null,
        helyrajziSzam: helyrajziSzam || null,
        teruletNm: teruletNm ? Number(teruletNm) : null,
      });
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni a temetőt");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      <h3 style={{ margin: 0 }}>Új temető</h3>
      <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
        A telekkönyvi adatok megadása nem kötelező - egy kisebb gyülekezet enélkül is felveheti a temetőt.
      </p>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Név</label>
          <input required value={nev} onChange={(e) => setNev(e.target.value)} placeholder="pl. Református temető" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Cím</label>
          <input value={cim} onChange={(e) => setCim(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Telekkönyvi szám</label>
          <input value={telekkonyvSzam} onChange={(e) => setTelekkonyvSzam(e.target.value)} />
        </div>
        <div className="field">
          <label>Helyrajzi szám</label>
          <input value={helyrajziSzam} onChange={(e) => setHelyrajziSzam(e.target.value)} />
        </div>
        <div className="field">
          <label>Terület (m²)</label>
          <input type="number" value={teruletNm} onChange={(e) => setTeruletNm(e.target.value)} />
        </div>
      </div>
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn" type="submit" style={{ alignSelf: "flex-start" }}>
        Létrehozás
      </button>
    </form>
  );
}

function CemeteryCard({ cemetery, onChanged, canEdit }: { cemetery: CemeteryData; onChanged: () => void; canEdit: boolean }) {
  const [showNewParcella, setShowNewParcella] = useState(false);
  const [newParcellaJelzes, setNewParcellaJelzes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function addParcella(e: FormEvent) {
    e.preventDefault();
    if (!newParcellaJelzes) return;
    await api.post("/api/temeto/parcellak", { cemeteryId: cemetery.id, jelzes: newParcellaJelzes });
    setNewParcellaJelzes("");
    setShowNewParcella(false);
    onChanged();
  }

  async function removeCemetery() {
    await api.delete(`/api/temeto/cemeteries/${cemetery.id}`);
    onChanged();
  }

  const sirhelyekCount = cemetery.parcellak.reduce((sum, p) => sum + p.sirhelyek.length, 0);

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="row" style={{ alignItems: "center", gap: 14 }}>
          <div className="icon-tile icon-tile--graphite">
            <IconMapPin style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <strong style={{ fontSize: "var(--font-size-lg)" }}>{cemetery.nev}</strong>
            <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
              {cemetery.cim && <>{cemetery.cim} · </>}
              {cemetery.parcellak.length} parcella, {sirhelyekCount} sírhely
              {cemetery.telekkonyvSzam && <> · telekkönyv: {cemetery.telekkonyvSzam}</>}
              {cemetery.helyrajziSzam && <> · helyrajzi szám: {cemetery.helyrajziSzam}</>}
              {cemetery.teruletNm && <> · {cemetery.teruletNm} m²</>}
            </div>
          </div>
        </div>
        {canEdit &&
          (!confirmDelete ? (
            <button className="btn-icon btn-icon-danger" title="Temető törlése" onClick={() => setConfirmDelete(true)}>
              <IconTrash style={{ width: 18, height: 18 }} />
            </button>
          ) : (
            <span className="row" style={{ alignItems: "center" }}>
              <span style={{ color: "var(--color-danger)" }}>Biztosan törli (minden parcellával, sírhellyel együtt)?</span>
              <button className="btn btn-danger btn-sm" onClick={removeCemetery}>
                Igen, törlöm
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>
                Mégse
              </button>
            </span>
          ))}
      </div>

      <div className="stack" style={{ gap: 10 }}>
        {cemetery.parcellak.map((parcella) => (
          <ParcellaBlock key={parcella.id} parcella={parcella} gyulekezetId={cemetery.gyulekezetId} onChanged={onChanged} canEdit={canEdit} />
        ))}
      </div>

      {canEdit &&
        (showNewParcella ? (
          <form onSubmit={addParcella} className="row" style={{ alignItems: "center" }}>
            <input
              required
              autoFocus
              value={newParcellaJelzes}
              onChange={(e) => setNewParcellaJelzes(e.target.value)}
              placeholder="pl. A sor"
            />
            <button className="btn btn-secondary btn-sm" type="submit">
              Hozzáadás
            </button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowNewParcella(false)}>
              Mégse
            </button>
          </form>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowNewParcella(true)}>
            <IconPlus style={{ width: 16, height: 16 }} /> Új parcella
          </button>
        ))}
    </div>
  );
}

function ParcellaBlock({
  parcella,
  gyulekezetId,
  onChanged,
  canEdit,
}: {
  parcella: ParcellaData;
  gyulekezetId: string;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [showNewSirhely, setShowNewSirhely] = useState(false);
  const [newSirhelyJelzes, setNewSirhelyJelzes] = useState("");

  async function addSirhely(e: FormEvent) {
    e.preventDefault();
    if (!newSirhelyJelzes) return;
    await api.post("/api/temeto/sirhelyek", { parcellaId: parcella.id, jelzes: newSirhelyJelzes });
    setNewSirhelyJelzes("");
    setShowNewSirhely(false);
    onChanged();
  }

  async function removeParcella() {
    await api.delete(`/api/temeto/parcellak/${parcella.id}`);
    onChanged();
  }

  return (
    <div
      className="stack"
      style={{
        gap: 10,
        padding: "var(--space-2)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-surface-alt)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <strong>{parcella.jelzes}</strong>
          <span className="badge-sm">{parcella.sirhelyek.length} sírhely</span>
        </div>
        {canEdit && parcella.sirhelyek.length === 0 && (
          <button className="btn-icon btn-icon-danger" title="Parcella törlése" onClick={removeParcella}>
            <IconTrash style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {parcella.sirhelyek.map((sirhely) => (
          <SirhelyRow key={sirhely.id} sirhely={sirhely} gyulekezetId={gyulekezetId} onChanged={onChanged} canEdit={canEdit} />
        ))}
      </div>

      {canEdit &&
        (showNewSirhely ? (
          <form onSubmit={addSirhely} className="row" style={{ alignItems: "center" }}>
            <input required autoFocus value={newSirhelyJelzes} onChange={(e) => setNewSirhelyJelzes(e.target.value)} placeholder="pl. 12-es sírhely" />
            <button className="btn btn-secondary btn-sm" type="submit">
              Hozzáadás
            </button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowNewSirhely(false)}>
              Mégse
            </button>
          </form>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowNewSirhely(true)}>
            <IconPlus style={{ width: 16, height: 16 }} /> Új sírhely
          </button>
        ))}
    </div>
  );
}

function SirhelyRow({
  sirhely,
  gyulekezetId,
  onChanged,
  canEdit,
}: {
  sirhely: SirhelyData;
  gyulekezetId: string;
  onChanged: () => void;
  canEdit: boolean;
}) {
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);

  async function toggleLezart() {
    await api.put(`/api/temeto/sirhelyek/${sirhely.id}`, { lezart: !sirhely.lezart });
    onChanged();
  }

  async function removeSirhely() {
    await api.delete(`/api/temeto/sirhelyek/${sirhely.id}`);
    onChanged();
  }

  const hasBurial = sirhely.burials.length > 0;
  const hasPurchase = sirhely.purchases.length > 0;

  return (
    <div
      className="stack"
      style={{ gap: 8, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <strong>{sirhely.jelzes}</strong>
          {sirhely.lezart && (
            <span className="badge-sm">
              <IconLock style={{ width: 13, height: 13 }} /> zárt sírhely
            </span>
          )}
          {hasBurial && (
            <span className="badge-sm" style={{ borderColor: "var(--color-primary)", color: "var(--color-primary-dark)" }}>
              <IconCross style={{ width: 13, height: 13 }} /> foglalt
            </span>
          )}
          {hasPurchase && (
            <span className="badge-sm" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
              megváltva
            </span>
          )}
        </div>
        {canEdit && (
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPurchaseForm((v) => !v)}>
              {showPurchaseForm ? "Mégse" : "Megváltás rögzítése"}
            </button>
            <button className="btn-icon" title={sirhely.lezart ? "Feloldás" : "Lezárás"} onClick={toggleLezart}>
              {sirhely.lezart ? <IconLockOpen style={{ width: 17, height: 17 }} /> : <IconLock style={{ width: 17, height: 17 }} />}
            </button>
            {!hasBurial && !hasPurchase && (
              <button className="btn-icon btn-icon-danger" title="Sírhely törlése" onClick={removeSirhely}>
                <IconTrash style={{ width: 16, height: 16 }} />
              </button>
            )}
          </div>
        )}
      </div>

      {sirhely.burials.map((b) => (
        <div key={b.id} style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          Temetés: <Link to={`/szemelyek/${b.person.id}`}>{b.person.vezeteknev} {b.person.keresztnev}</Link> — {b.datuma.slice(0, 10)}
        </div>
      ))}
      {sirhely.purchases.map((p) => (
        <div key={p.id} style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          Megváltás: {p.megvaltoPerson ? (
            <Link to={`/szemelyek/${p.megvaltoPerson.id}`}>{p.megvaltoNeve}</Link>
          ) : (
            p.megvaltoNeve
          )}{" "}
          — {p.datuma.slice(0, 10)}, {p.osszeg} lej, lejárat: {p.lejarat.slice(0, 10)}
        </div>
      ))}

      {showPurchaseForm && (
        <AddGravePurchaseForm
          sirhelyId={sirhely.id}
          gyulekezetId={gyulekezetId}
          onDone={() => { setShowPurchaseForm(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function AddGravePurchaseForm({ sirhelyId, gyulekezetId, onDone }: { sirhelyId: string; gyulekezetId: string; onDone: () => void }) {
  const [megvaltoNeve, setMegvaltoNeve] = useState("");
  const [datuma, setDatuma] = useState(new Date().toISOString().slice(0, 10));
  const [osszeg, setOsszeg] = useState("");
  // Az utoljára automatikusan (a beállított ár alapján) kitöltött érték - amíg az
  // összeg mező ezzel egyezik, dátumváltáskor felülírható; ha a felhasználó
  // kézzel módosította, onnantól nem nyúlunk hozzá.
  const [autoOsszeg, setAutoOsszeg] = useState<string | null>(null);
  const [noConfig, setNoConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ev = new Date(datuma).getFullYear();
    if (!gyulekezetId || Number.isNaN(ev)) return;
    api
      .get<{ osszeg: number | null; ervenyessegEv: number | null }>(
        `/api/temeto/grave-price?gyulekezetId=${gyulekezetId}&ev=${ev}`
      )
      .then((res) => {
        setNoConfig(res.osszeg === null);
        const nextValue = res.osszeg !== null ? String(res.osszeg) : "";
        setOsszeg((current) => (autoOsszeg === null || current === autoOsszeg ? nextValue : current));
        setAutoOsszeg(nextValue);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyulekezetId, datuma]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/temeto/grave-purchases", {
        sirhelyId,
        megvaltoNeve,
        datuma,
        ...(osszeg ? { osszeg: Number(osszeg) } : {}),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült rögzíteni");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <input required placeholder="Megváltó neve" value={megvaltoNeve} onChange={(e) => setMegvaltoNeve(e.target.value)} />
        <DateInput value={datuma} onChange={(e) => setDatuma(e.target.value)} />
        <input
          type="number"
          placeholder={noConfig ? "Nincs beállított ár - adja meg" : "Összeg"}
          style={{ width: 220 }}
          value={osszeg}
          onChange={(e) => setOsszeg(e.target.value)}
        />
        <button className="btn btn-secondary btn-sm" type="submit" disabled={saving}>
          Mentés
        </button>
      </div>
      {!noConfig && autoOsszeg && (
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          Az összeg a beállított sírhelyárral van előtöltve - szükség esetén szerkeszthető.
        </span>
      )}
      {error && <span style={{ color: "var(--color-danger)" }}>{error}</span>}
    </form>
  );
}
