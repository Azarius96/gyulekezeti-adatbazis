import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { DateInput } from "./DateInput";

/** Ennyi hónapon belül lejáró sírhelymegváltásokat jelezzük előre, hogy legyen idő
 * a megújításról dönteni vagy - lejárat után - a sírhelyet a szabályzat szerint kezelni. */
export const LEJARAT_ELORE_JELZES_HONAP = 12;

export interface PersonRef {
  id: string;
  vezeteknev: string;
  keresztnev: string;
}

export interface BurialData {
  id: string;
  datuma: string;
  halottiAnyakonyviSzam: string | null;
  person: PersonRef;
}

export interface PurchaseData {
  id: string;
  megvaltoNeve: string;
  megvaltoPerson: PersonRef | null;
  datuma: string;
  osszeg: string;
  lejarat: string;
}

export interface SirhelyData {
  id: string;
  jelzes: string;
  lezart: boolean;
  burials: BurialData[];
  purchases: PurchaseData[];
}

export interface ParcellaData {
  id: string;
  jelzes: string;
  sirhelyek: SirhelyData[];
}

export interface CemeteryData {
  id: string;
  gyulekezetId: string;
  nev: string;
  cim: string | null;
  telekkonyvSzam: string | null;
  helyrajziSzam: string | null;
  teruletNm: number | null;
  parcellak: ParcellaData[];
  /** Közvetlenül a temetőhöz rögzített (parcella/sírhely nélküli) temetések. */
  burials?: BurialData[];
}

/** Egy adott gyülekezet temetői, a teljes parcella/sírhely fával - az AddBurialForm ehhez
 * kínál autocomplete-et és foglaltság-ellenőrzést. */
export function useCemeteries(gyulekezetId: string) {
  const [cemeteries, setCemeteries] = useState<CemeteryData[]>([]);
  useEffect(() => {
    if (!gyulekezetId) {
      setCemeteries([]);
      return;
    }
    api
      .get<CemeteryData[]>(`/api/temeto?gyulekezetId=${gyulekezetId}`)
      .then(setCemeteries)
      .catch(() => setCemeteries([]));
  }, [gyulekezetId]);
  return cemeteries;
}

export function AddBurialForm({
  personId,
  gyulekezetId,
  cemeteries,
  initialElhunytDatuma,
  onDone,
  onCancel,
}: {
  personId: string;
  gyulekezetId: string;
  cemeteries: CemeteryData[];
  /** Ha a személy már el van jelölve elhunytként, ennek a meglévő halálozási dátuma - előtöltésre. */
  initialElhunytDatuma?: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [cemeteryId, setCemeteryId] = useState(cemeteries[0]?.id ?? "");
  const [parcellaJelzes, setParcellaJelzes] = useState("");
  const [sirhelyJelzes, setSirhelyJelzes] = useState("");
  const [elhunytDatuma, setElhunytDatuma] = useState(
    initialElhunytDatuma ? initialElhunytDatuma.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [datuma, setDatuma] = useState(new Date().toISOString().slice(0, 10));
  const [halottiAnyakonyviSzam, setHalottiAnyakonyviSzam] = useState("");
  const [elfogadva, setElfogadva] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cemeteryId && cemeteries.length > 0) setCemeteryId(cemeteries[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cemeteries]);

  const matchedSirhely = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase();
    const cemetery = cemeteries.find((c) => c.id === cemeteryId);
    const parcella = cemetery?.parcellak.find((p) => norm(p.jelzes) === norm(parcellaJelzes));
    return parcella?.sirhelyek.find((s) => norm(s.jelzes) === norm(sirhelyJelzes)) ?? null;
  }, [cemeteries, cemeteryId, parcellaJelzes, sirhelyJelzes]);

  const occupied = matchedSirhely !== null && matchedSirhely.burials.length > 0;
  const latestPurchase = matchedSirhely?.purchases[0] ?? null;
  const purchaseHorizon = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + LEJARAT_ELORE_JELZES_HONAP);
    return d;
  }, []);
  const purchaseExpiring = latestPurchase ? new Date(latestPurchase.lejarat) <= purchaseHorizon : false;
  const purchaseExpired = latestPurchase ? new Date(latestPurchase.lejarat) < new Date() : false;

  useEffect(() => {
    setElfogadva(false);
  }, [matchedSirhely]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cemeteryId) {
      setError("Előbb vegyen fel legalább egy temetőt");
      return;
    }
    if (!!parcellaJelzes.trim() !== !!sirhelyJelzes.trim()) {
      setError("A parcellát és a sírhelyet együtt adja meg - vagy mindkettőt hagyja üresen, ha a temető nincs parcellákra osztva");
      return;
    }
    if (occupied && !elfogadva) {
      setError("Erősítse meg, hogy tudomásul vette, hogy a sírhely már foglalt");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/temeto/burials", {
        personId,
        cemeteryId,
        parcellaJelzes,
        sirhelyJelzes,
        datuma,
        elhunytDatuma,
        halottiAnyakonyviSzam: halottiAnyakonyviSzam || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült rögzíteni a temetést");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      <h3 style={{ margin: 0 }}>Temetés rögzítése</h3>
      <div className="row">
        <div className="field">
          <label>Elhalálozás dátuma</label>
          <DateInput required value={elhunytDatuma} onChange={(e) => setElhunytDatuma(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Halotti anyakönyvi szám</label>
          <input
            value={halottiAnyakonyviSzam}
            onChange={(e) => setHalottiAnyakonyviSzam(e.target.value)}
            placeholder="ha ismert"
          />
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Temető</label>
          <select value={cemeteryId} onChange={(e) => setCemeteryId(e.target.value)}>
            {cemeteries.length === 0 && <option value="">— nincs felvéve temető —</option>}
            {cemeteries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nev}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Parcella (nem kötelező)</label>
          <input list="parcella-list" value={parcellaJelzes} onChange={(e) => setParcellaJelzes(e.target.value)} placeholder="pl. A sor" />
          <datalist id="parcella-list">
            {cemeteries.find((c) => c.id === cemeteryId)?.parcellak.map((p) => <option key={p.id} value={p.jelzes} />)}
          </datalist>
        </div>
        <div className="field">
          <label>Sírhely (nem kötelező)</label>
          <input value={sirhelyJelzes} onChange={(e) => setSirhelyJelzes(e.target.value)} placeholder="pl. 12-es sírhely" />
        </div>
        <div className="field">
          <label>Temetés dátuma</label>
          <DateInput required value={datuma} onChange={(e) => setDatuma(e.target.value)} />
        </div>
      </div>

      <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        Ha a temető nincs parcellákra osztva, a parcellát és a sírhelyet hagyja üresen - ilyenkor a temetés közvetlenül a
        temetőhöz kerül.
      </p>

      {occupied && (
        <div
          className="stack"
          style={{ gap: 8, padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "rgba(255, 69, 58, 0.14)", border: "1px solid var(--color-danger)" }}
        >
          <strong style={{ color: "var(--color-danger)" }}>Ez a sírhely már foglalt.</strong>
          <div style={{ fontSize: "var(--font-size-sm)" }}>
            Ide már temettek:{" "}
            {matchedSirhely!.burials.map((b, i) => (
              <span key={b.id}>
                {i > 0 && ", "}
                <Link to={`/szemelyek/${b.person.id}`}>{b.person.vezeteknev} {b.person.keresztnev}</Link> ({b.datuma.slice(0, 10)})
              </span>
            ))}
          </div>
          <label className="row" style={{ alignItems: "center", fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
            <input type="checkbox" checked={elfogadva} onChange={(e) => setElfogadva(e.target.checked)} />
            Tudomásul veszem, hogy a sírhely már foglalt, mégis ide szeretnék temetni
          </label>
        </div>
      )}

      {latestPurchase && (purchaseExpired || purchaseExpiring) && (
        <div
          className="row"
          style={{ alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "var(--color-accent-light)" }}
        >
          <span style={{ color: "var(--color-accent)", fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
            {purchaseExpired ? "A sírhely megváltása lejárt" : "A sírhely megváltása hamarosan lejár"}
            {" "}(lejárat: {latestPurchase.lejarat.slice(0, 10)}) - érdemes rendezni a megújítást.
          </span>
        </div>
      )}

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <div className="row">
        <button className="btn" type="submit" disabled={saving || !gyulekezetId || (occupied && !elfogadva)}>
          {saving ? "Mentés..." : "Mentés"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          Mégse
        </button>
      </div>
    </form>
  );
}
