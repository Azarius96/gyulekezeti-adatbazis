import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";

interface AuditItem {
  id: string;
  userId: string | null;
  userNev: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  gyulekezetId: string | null;
  gyulekezetNev: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  targetPersons: string[];
  targetPersonId: string | null;
  targetHousehold: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  vezeteknev: "Vezetéknév", keresztnev: "Keresztnév", nem: "Nem", szuletesiDatum: "Születési dátum",
  szuletesiHely: "Születési hely", vallas: "Vallás", csaladiAllapot: "Családi állapot", elhunyt: "Elhunyt",
  elhunytDatuma: "Elhalálozás dátuma", megjegyzes: "Megjegyzés", nyitoTartozas: "Nyitó tartozás",
  ev: "Év", osszeg: "Összeg", fizetesDatuma: "Fizetés dátuma", datuma: "Dátum", helye: "Helye",
  keresztszulok: "Keresztszülők", lelkeszNeve: "Lelkész", tisztseg: "Tisztség", kezdete: "Kezdete",
  vege: "Vége", szerep: "Szerep", nev: "Név", cim: "Cím", jelzes: "Jelzés", lezart: "Lezárt",
  halottiAnyakonyviSzam: "Halotti anyakönyvi szám", megvaltoNeve: "Megváltó neve", lejarat: "Lejárat",
  telepules: "Település", utca: "Utca", hazszam: "Házszám", status: "Állapot", indoklas: "Indoklás",
  regiCim: "Régi cím", ujCim: "Új cím", kulsoHazastarsNeve: "Külső házastárs neve",
  vallasTipusManualis: "Vallástípus (kézi)", kertSzint: "Kért szint",
};

// Technikai mezők, amiket sosem mutatunk a változás-listában.
const HIDDEN_FIELDS = new Set(["id", "createdAt", "updatedAt", "deletedAt", "passwordHash"]);

const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key;
const isTechnical = (key: string) => HIDDEN_FIELDS.has(key) || /Id$/.test(key);

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "igen" : "nem";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString("hu-HU");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const ENTITY_LABELS: Record<string, string> = {
  Gyulekezet: "Gyülekezet",
  Person: "Személy",
  Household: "Háztartás",
  HouseholdMember: "Háztartás-tagság",
  FamilyLink: "Rokoni kapcsolat",
  Marriage: "Házasság",
  Baptism: "Keresztelés",
  Confirmation: "Konfirmáció",
  ChurchDuesConfig: "Egyházfenntartói korsáv",
  DuesPayment: "Egyházfenntartó befizetés",
  Donation: "Adomány",
  Position: "Tisztség",
  Cemetery: "Temető",
  Parcella: "Parcella",
  Sirhely: "Sírhely",
  Burial: "Temetés",
  GravePriceConfig: "Sírhelyár",
  GravePurchase: "Sírhelymegváltás",
  MovingRequest: "Költözés",
  Event: "Esemény",
  TeendoTeljesites: "Teendő-teljesítés",
  UserRole: "Felhasználói szerepkör",
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CREATE: { label: "Létrehozva", color: "var(--color-success, #2a9d5c)" },
  UPDATE: { label: "Módosítva", color: "var(--color-accent, #3b6fd6)" },
  DELETE: { label: "Törölve", color: "var(--color-danger)" },
  RESTORE: { label: "Visszaállítva", color: "var(--color-warning, #c98a1f)" },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("hu-HU");
}

/** Csak azokat a mezőket mutatja, amik ténylegesen megváltoztak - ne kelljen a teljes,
 * technikai JSON-dumpot bogarászni, hogy mi is történt valójában. */
function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { key: string; before: unknown; after: unknown }[] {
  if (!after && before) {
    return Object.keys(before).filter((k) => !isTechnical(k) && before[k] !== null && before[k] !== "").map((key) => ({ key, before: before[key], after: undefined }));
  }
  if (!before && after) {
    return Object.keys(after).filter((k) => !isTechnical(k) && after[k] !== null && after[k] !== "").map((key) => ({ key, before: undefined, after: after[key] }));
  }
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { key: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    if (isTechnical(key)) continue;
    const b = JSON.stringify(before[key]);
    const a = JSON.stringify(after[key]);
    if (b !== a) out.push({ key, before: before[key], after: after[key] });
  }
  return out;
}

function AuditRow({ item }: { item: AuditItem }) {
  const [open, setOpen] = useState(false);
  const actionInfo = ACTION_LABELS[item.action] ?? { label: item.action, color: "var(--color-text-muted)" };
  const changes = diffFields(item.before, item.after);
  const isUpdate = item.action === "UPDATE";
  const subject =
    item.targetPersons.length > 0
      ? item.targetPersons.join(" és ")
      : item.targetHousehold ?? null;
  const preview = isUpdate
    ? changes.slice(0, 3).map((c) => `${fieldLabel(c.key)}: ${fmtValue(c.before)} → ${fmtValue(c.after)}`).join(" · ") +
      (changes.length > 3 ? ` · +${changes.length - 3} további` : "")
    : "";

  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "flex-start", cursor: changes.length ? "pointer" : "default" }}
        onClick={() => changes.length && setOpen((v) => !v)}
      >
        <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 700, color: actionInfo.color, fontSize: "var(--font-size-sm)" }}>{actionInfo.label}</span>
            <span style={{ color: "var(--color-text-muted)" }}>{ENTITY_LABELS[item.entity] ?? item.entity}</span>
            {subject && (
              <strong onClick={(e) => e.stopPropagation()}>
                {item.targetPersonId && item.targetPersons.length > 0 ? (
                  <Link to={`/szemelyek/${item.targetPersonId}`}>{subject}</Link>
                ) : (
                  subject
                )}
              </strong>
            )}
          </div>
          {preview && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{preview}</div>}
        </div>
        <div className="stack" style={{ gap: 2, alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{ fontSize: "var(--font-size-sm)" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Módosította: </span>
            <strong>{item.userNev ?? "ismeretlen felhasználó"}</strong>
          </span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{fmtDateTime(item.createdAt)}</span>
        </div>
      </div>
      {open && changes.length > 0 && (
        <div className="stack" style={{ marginTop: 10, gap: 4, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
          {changes.map((c) => (
            <div key={c.key} className="row" style={{ fontSize: "var(--font-size-sm)", gap: 8 }}>
              <span style={{ color: "var(--color-text-muted)", minWidth: 160 }}>{fieldLabel(c.key)}</span>
              {c.before !== undefined && (
                <span style={{ textDecoration: c.after !== undefined ? "line-through" : "none", color: "var(--color-text-muted)" }}>
                  {fmtValue(c.before)}
                </span>
              )}
              {c.before !== undefined && c.after !== undefined && <span>→</span>}
              {c.after !== undefined && <span style={{ fontWeight: 600 }}>{fmtValue(c.after)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ValtozasTortenet() {
  const [searchParams] = useSearchParams();
  const entityIdFilter = searchParams.get("entityId") ?? "";
  const [gyulekezetId] = useSelectedGyulekezet();
  const [entity, setEntity] = useState(searchParams.get("entity") ?? "");
  const [action, setAction] = useState("");
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [gyulekezetId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);
    if (entityIdFilter) params.set("entityId", entityIdFilter);
    api
      .get<{ items: AuditItem[]; total: number }>(`/api/audit-log?${params.toString()}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [gyulekezetId, entity, action, page, entityIdFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  // Gyülekezetenkénti bontás (a lista időrendje gyülekezeten belül megmarad).
  const groups = Array.from(
    items.reduce((m, it) => {
      const k = it.gyulekezetNev ?? "Gyülekezethez nem köthető";
      m.set(k, [...(m.get(k) ?? []), it]);
      return m;
    }, new Map<string, AuditItem[]>())
  );

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Változás-történet</h1>
        <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          Minden rögzített módosítás - kin, mit, ki és mikor változtatott. A lista a kiválasztott gyülekezet változásait mutatja (a bal oldali gyülekezet-választó szerint), gyülekezetenként csoportosítva.
        </p>
        {entityIdFilter && (
          <p style={{ margin: "6px 0 0" }}>
            Csak ennek az egy rekordnak a története látszik. <Link to="/valtozas-tortenet">Összes változás megtekintése →</Link>
          </p>
        )}
      </div>

      <div className="card row" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="field">
          <label>Típus</label>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Összes</option>
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Művelet</label>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Összes</option>
            <option value="CREATE">Létrehozva</option>
            <option value="UPDATE">Módosítva</option>
            <option value="DELETE">Törölve</option>
            <option value="RESTORE">Visszaállítva</option>
          </select>
        </div>
      </div>

      {loading && <p style={{ color: "var(--color-text-muted)" }}>Betöltés...</p>}
      {!loading && items.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Nincs a szűrésnek megfelelő bejegyzés.</p>}

      {groups.map(([nev, groupItems]) => (
        <div key={nev} className="stack" style={{ gap: 6 }}>
          {(groups.length > 1 || !gyulekezetId) && (
            <h2 style={{ fontSize: "var(--font-size-lg)", margin: "8px 0 0" }}>{nev}</h2>
          )}
          {groupItems.map((item) => (
            <AuditRow key={item.id} item={item} />
          ))}
        </div>
      ))}

      {totalPages > 1 && (
        <div className="row" style={{ justifyContent: "center", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Előző
          </button>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Következő
          </button>
        </div>
      )}
    </div>
  );
}
