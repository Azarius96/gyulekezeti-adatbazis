import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { isAdmin, ownGyulekezetIds } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useGyulekezetek } from "./GyulekezetSelect";
import { DateInput } from "./DateInput";

interface EventItem {
  id: string;
  cim: string;
  leiras: string | null;
  datuma: string;
  szint: "HELYI" | "MEGYEI" | "KERULETI";
  status: "AKTIV" | "ESKALACIO_FUGGOBEN" | "JOVAHAGYVA" | "ELUTASITVA";
  gyulekezetId: string | null;
  gyulekezet: { nev: string } | null;
}

const szintLabels: Record<string, string> = {
  HELYI: "Helyi",
  MEGYEI: "Megyei",
  KERULETI: "Kerületi",
};

const statusLabels: Record<string, string> = {
  AKTIV: "",
  ESKALACIO_FUGGOBEN: "jóváhagyásra vár",
  JOVAHAGYVA: "",
  ELUTASITVA: "elutasítva",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
}

const honapRovid = ["JAN", "FEBR", "MÁRC", "ÁPR", "MÁJ", "JÚN", "JÚL", "AUG", "SZEPT", "OKT", "NOV", "DEC"];

function CalendarBadge({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <div
      style={{
        width: 48,
        flexShrink: 0,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        textAlign: "center",
      }}
    >
      <div style={{ background: "var(--color-primary)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 0" }}>
        {honapRovid[d.getMonth()]}
      </div>
      <div style={{ padding: "4px 0", fontWeight: 800, fontSize: 18, fontFamily: "var(--font-display)" }}>{d.getDate()}</div>
    </div>
  );
}

export function EventsBoard({ gyulekezetId }: { gyulekezetId: string }) {
  const { user } = useAuth();
  const gyulekezetek = useGyulekezetek();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [pending, setPending] = useState<EventItem[]>([]);
  const [showForm, setShowForm] = useState(false);

  function load() {
    api
      .get<EventItem[]>(`/api/events${gyulekezetId ? `?gyulekezetId=${gyulekezetId}` : ""}`)
      .then(setEvents)
      .catch(() => setEvents([]));
    api
      .get<EventItem[]>("/api/events/pending")
      .then(setPending)
      .catch(() => setPending([]));
  }

  useEffect(load, [gyulekezetId]);

  async function approve(id: string) {
    await api.put(`/api/events/${id}/approve`);
    load();
  }

  async function reject(id: string) {
    await api.put(`/api/events/${id}/reject`);
    load();
  }

  async function remove(id: string) {
    await api.delete(`/api/events/${id}`);
    load();
  }

  const canCreate = isAdmin(user) || ownGyulekezetIds(user).length > 0;
  // A form gyülekezet-választója csak azokat kínálja fel, amelyekhez a felhasználónak
  // ténylegesen szerkesztési joga van - egy esperes/püspök itt látott, de nem sajátja
  // gyülekezet nem választható (a szerver úgyis elutasítaná).
  const eventGyulekezetek = isAdmin(user) ? gyulekezetek : gyulekezetek.filter((g) => ownGyulekezetIds(user).includes(g.id));
  const upcoming = events.filter((e) => e.status !== "ELUTASITVA");

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Hirdetőtábla</h2>
        {canCreate && (
          <button className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Mégse" : "Új esemény"}
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <div className="stack" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 12 }}>
          <strong style={{ color: "var(--color-accent)" }}>Jóváhagyásra váró események</strong>
          {pending.map((e) => (
            <div key={e.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span>
                {e.cim} — {formatDate(e.datuma)} ({szintLabels[e.szint]}, {e.gyulekezet?.nev})
              </span>
              <div className="row">
                <button className="btn btn-secondary btn-sm" onClick={() => approve(e.id)}>
                  Jóváhagyás
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => reject(e.id)}>
                  Elutasítás
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <NewEventForm
          gyulekezetek={eventGyulekezetek}
          defaultGyulekezetId={ownGyulekezetIds(user)[0] ?? eventGyulekezetek[0]?.id ?? ""}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {upcoming.length === 0 && <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Nincs közelgő esemény.</p>}
      <div className="stack">
        {upcoming.map((e) => (
          <div key={e.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="row" style={{ alignItems: "center" }}>
              <CalendarBadge iso={e.datuma} />
              <div>
                <strong>{e.cim}</strong>
                <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                  {formatDate(e.datuma)}
                  {e.gyulekezet ? ` · ${e.gyulekezet.nev}` : ""}
                  {statusLabels[e.status] ? ` · ${statusLabels[e.status]}` : ""}
                </div>
              </div>
            </div>
            {(isAdmin(user) || (e.gyulekezetId && ownGyulekezetIds(user).includes(e.gyulekezetId))) && (
              <button className="btn btn-secondary btn-sm" onClick={() => remove(e.id)}>
                Törlés
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NewEventForm({
  gyulekezetek,
  defaultGyulekezetId,
  onCreated,
}: {
  gyulekezetek: { id: string; nev: string }[];
  defaultGyulekezetId: string;
  onCreated: () => void;
}) {
  const [cim, setCim] = useState("");
  const [leiras, setLeiras] = useState("");
  const [datuma, setDatuma] = useState("");
  const [gyulekezetId, setGyulekezetId] = useState(defaultGyulekezetId);
  const [kertSzint, setKertSzint] = useState<"HELYI" | "MEGYEI" | "KERULETI">("HELYI");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/api/events", { cim, leiras: leiras || null, datuma, gyulekezetId, kertSzint });
      onCreated();
    } catch {
      setError("Nem sikerült létrehozni az eseményt");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 12 }}>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Esemény címe</label>
          <input required value={cim} onChange={(e) => setCim(e.target.value)} />
        </div>
        <div className="field">
          <label>Dátum</label>
          <DateInput required value={datuma} onChange={(e) => setDatuma(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Leírás (opcionális)</label>
        <input value={leiras} onChange={(e) => setLeiras(e.target.value)} />
      </div>
      <div className="row">
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
        <div className="field">
          <label>Szint</label>
          <select value={kertSzint} onChange={(e) => setKertSzint(e.target.value as "HELYI" | "MEGYEI" | "KERULETI")}>
            <option value="HELYI">Helyi</option>
            <option value="MEGYEI">Kérem megyei szintre</option>
            <option value="KERULETI">Kérem kerületi szintre</option>
          </select>
        </div>
      </div>
      {kertSzint !== "HELYI" && (
        <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "var(--font-size-sm)" }}>
          A megyei/kerületi szintre emelést az esperesnek vagy püspöknek jóvá kell hagynia, addig csak jóváhagyásra
          várva jelenik meg.
        </p>
      )}
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      <button className="btn" type="submit" style={{ alignSelf: "flex-start" }}>
        Esemény létrehozása
      </button>
    </form>
  );
}
