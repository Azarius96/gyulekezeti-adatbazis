import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";

interface TrashItem {
  entity: string;
  id: string;
  deletedAt: string;
  label: string;
  gyulekezetId: string | null;
  gyulekezetNev: string | null;
}

const ENTITY_LABELS: Record<string, string> = {
  Gyulekezet: "Gyülekezet",
  Person: "Személy",
  Marriage: "Házasság",
  Burial: "Temetés",
  GravePurchase: "Sírhelymegváltás",
  DuesPayment: "Egyházfenntartó befizetés",
  Donation: "Adomány",
  Cemetery: "Temető",
  Parcella: "Parcella",
  Sirhely: "Sírhely",
  ChurchDuesConfig: "Egyházfenntartói korsáv",
  GravePriceConfig: "Sírhelyár",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("hu-HU");
}

export function Papirkosar() {
  const [selectedGyulekezetId] = useSelectedGyulekezet();
  const [allItems, setItems] = useState<TrashItem[]>([]);
  const items = selectedGyulekezetId ? allItems.filter((i) => i.gyulekezetId === selectedGyulekezetId) : allItems;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .get<{ items: TrashItem[] }>("/api/trash")
      .then((res) => setItems(res.items))
      .catch(() => setError("Nem sikerült betölteni a papírkosarat"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function restore(item: TrashItem) {
    const key = `${item.entity}:${item.id}`;
    setRestoringKey(key);
    setError(null);
    try {
      await api.post(`/api/trash/${item.entity}/${item.id}/restore`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nem sikerült visszaállítani");
    } finally {
      setRestoringKey(null);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Papírkosár</h1>
        <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
          A törölt elemek nem vesznek el véglegesen - innen bármikor visszaállíthatók. Amíg egy elem itt van, sehol
          máshol nem jelenik meg a rendszerben.
        </p>
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {loading && <p style={{ color: "var(--color-text-muted)" }}>Betöltés...</p>}
      {!loading && items.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>A papírkosár üres.</p>}

      <div className="stack" style={{ gap: 6 }}>
        {items.map((item) => {
          const key = `${item.entity}:${item.id}`;
          return (
            <div key={key} className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{item.label}</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                  {ENTITY_LABELS[item.entity] ?? item.entity}
                  {item.gyulekezetNev && <> · {item.gyulekezetNev}</>} · törölve: {fmtDateTime(item.deletedAt)}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" disabled={restoringKey === key} onClick={() => restore(item)}>
                {restoringKey === key ? "Visszaállítás..." : "Visszaállítás"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
