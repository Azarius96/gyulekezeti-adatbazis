import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

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
}

interface GyulekezetOption {
  id: string;
  nev: string;
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
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { key: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const b = JSON.stringify(before[key]);
    const a = JSON.stringify(after[key]);
    if (b !== a) out.push({ key, before: before[key], after: after[key] });
  }
  return out;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function AuditRow({ item }: { item: AuditItem }) {
  const [open, setOpen] = useState(false);
  const actionInfo = ACTION_LABELS[item.action] ?? { label: item.action, color: "var(--color-text-muted)" };
  const changes = diffFields(item.before, item.after);

  return (
    <div className="card" style={{ padding: "10px 14px" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", cursor: changes.length ? "pointer" : "default" }} onClick={() => changes.length && setOpen((v) => !v)}>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, color: actionInfo.color, fontSize: "var(--font-size-sm)" }}>{actionInfo.label}</span>
          <span>{ENTITY_LABELS[item.entity] ?? item.entity}</span>
          {item.gyulekezetNev && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>· {item.gyulekezetNev}</span>}
        </div>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{item.userNev ?? "ismeretlen felhasználó"}</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{fmtDateTime(item.createdAt)}</span>
        </div>
      </div>
      {open && changes.length > 0 && (
        <div className="stack" style={{ marginTop: 10, gap: 4, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
          {changes.map((c) => (
            <div key={c.key} className="row" style={{ fontSize: "var(--font-size-sm)", gap: 8 }}>
              <span style={{ color: "var(--color-text-muted)", minWidth: 140 }}>{c.key}</span>
              <span style={{ textDecoration: "line-through", color: "var(--color-text-muted)" }}>{fmtValue(c.before)}</span>
              <span>→</span>
              <span style={{ fontWeight: 600 }}>{fmtValue(c.after)}</span>
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
  const [gyulekezetek, setGyulekezetek] = useState<GyulekezetOption[]>([]);
  const [gyulekezetId, setGyulekezetId] = useState("");
  const [entity, setEntity] = useState(searchParams.get("entity") ?? "");
  const [action, setAction] = useState("");
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<GyulekezetOption[]>("/api/audit-log/gyulekezetek").then(setGyulekezetek).catch(() => setGyulekezetek([]));
  }, []);

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

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Változás-történet</h1>
        <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          Minden rögzített módosítás - ki, mikor, mit változtatott. A lista csak azokat a gyülekezeteket mutatja, amikhez hozzáférése van.
        </p>
        {entityIdFilter && (
          <p style={{ margin: "6px 0 0" }}>
            Csak ennek az egy rekordnak a története látszik. <Link to="/valtozas-tortenet">Összes változás megtekintése →</Link>
          </p>
        )}
      </div>

      <div className="card row" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="field">
          <label>Gyülekezet</label>
          <select
            value={gyulekezetId}
            onChange={(e) => {
              setGyulekezetId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Összes elérhető gyülekezet</option>
            {gyulekezetek.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nev}
              </option>
            ))}
          </select>
        </div>
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

      <div className="stack" style={{ gap: 6 }}>
        {items.map((item) => (
          <AuditRow key={item.id} item={item} />
        ))}
      </div>

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
