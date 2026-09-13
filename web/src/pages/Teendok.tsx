import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { GyulekezetSelect, useGyulekezetek } from "../components/GyulekezetSelect";
import { canEditGyulekezet } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { IconHistory, IconChevronDown, IconChevronRight } from "../components/icons";

type Allapot = "lejart" | "hamarosan" | "folyamatos" | "tavoli" | "teljesitve";

interface TeendoStatus {
  id: string;
  cim: string;
  rovidLeiras: string;
  kanonHivatkozas: string;
  reszletes: string;
  hataridoDatum: string | null;
  allapot: Allapot;
  teljesitveDatuma: string | null;
  link?: string;
}

interface TeendoGyulekezetGroup {
  gyulekezetId: string;
  gyulekezetNev: string;
  teendok: TeendoStatus[];
}

const allapotLabel: Record<Allapot, string> = {
  lejart: "lejárt",
  hamarosan: "hamarosan esedékes",
  folyamatos: "folyamatos kötelezettség",
  tavoli: "idén még ráér",
  teljesitve: "teljesítve",
};

const allapotTone: Record<Allapot, { borderColor: string; color: string }> = {
  lejart: { borderColor: "var(--color-danger)", color: "var(--color-danger)" },
  hamarosan: { borderColor: "var(--color-accent)", color: "var(--color-accent)" },
  folyamatos: { borderColor: "var(--color-border)", color: "var(--color-text-muted)" },
  tavoli: { borderColor: "var(--color-border)", color: "var(--color-text-muted)" },
  teljesitve: { borderColor: "var(--color-primary)", color: "var(--color-primary-dark)" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
}

export function Teendok() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const gyulekezetek = useGyulekezetek();
  const [gyulekezetId, setGyulekezetId] = useState("");
  const [groups, setGroups] = useState<TeendoGyulekezetGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (gyulekezetId) params.set("gyulekezetId", gyulekezetId);
    api
      .get<TeendoGyulekezetGroup[]>(`/api/teendok?${params.toString()}`)
      .then(setGroups)
      .catch(() => setError("Nem sikerült betölteni a teendőket"));
  }

  useEffect(load, [gyulekezetId]);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Törvényben előírt teendők</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>
            A Romániai Református Egyház törvénytára alapján évente esedékes egyházközségi kötelezettségek.
          </p>
        </div>
        <GyulekezetSelect value={gyulekezetId} onChange={setGyulekezetId} gyulekezetek={gyulekezetek} />
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      {groups.map((g) => (
        <div key={g.gyulekezetId} className="stack">
          {groups.length > 1 && <h2 style={{ fontSize: "var(--font-size-lg)", margin: "8px 0 0" }}>{g.gyulekezetNev}</h2>}
          <div className="stack" style={{ gap: 10 }}>
            {g.teendok.map((t) => (
              <TeendoCard
                key={t.id}
                teendo={t}
                gyulekezetId={g.gyulekezetId}
                canEdit={canEditGyulekezet(user, g.gyulekezetId)}
                onChanged={load}
                onNavigate={navigate}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeendoCard({
  teendo,
  gyulekezetId,
  canEdit,
  onChanged,
  onNavigate,
}: {
  teendo: TeendoStatus;
  gyulekezetId: string;
  canEdit: boolean;
  onChanged: () => void;
  onNavigate: (to: string) => void;
}) {
  const [expanded, setExpanded] = useState(teendo.allapot === "lejart" || teendo.allapot === "hamarosan");
  const [saving, setSaving] = useState(false);

  async function toggleDone() {
    setSaving(true);
    try {
      if (teendo.allapot === "teljesitve") {
        await api.delete(`/api/teendok/${teendo.id}/teljesit?gyulekezetId=${gyulekezetId}`);
      } else {
        await api.post(`/api/teendok/${teendo.id}/teljesit`, { gyulekezetId });
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="row list-row"
          style={{
            alignItems: "center",
            gap: 14,
            flex: 1,
            padding: "4px 8px",
            background: "none",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
            textAlign: "left",
          }}
        >
          <span className="icon-tile icon-tile--indigo">
            <IconHistory style={{ width: 22, height: 22 }} />
          </span>
          <span style={{ flex: 1 }}>
            <strong>{teendo.cim}</strong>
            <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{teendo.rovidLeiras}</div>
          </span>
          {expanded ? <IconChevronDown style={{ width: 18, height: 18, flexShrink: 0 }} /> : <IconChevronRight style={{ width: 18, height: 18, flexShrink: 0 }} />}
        </button>
        <span className="badge-sm" style={allapotTone[teendo.allapot]}>
          {allapotLabel[teendo.allapot]}
        </span>
      </div>

      {expanded && (
        <div className="stack" style={{ gap: 10, paddingLeft: 4, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
          {teendo.hataridoDatum && (
            <div>
              <strong>Határidő:</strong> {formatDate(teendo.hataridoDatum)}
            </div>
          )}
          {teendo.teljesitveDatuma && (
            <div style={{ color: "var(--color-text-muted)" }}>Teljesítve: {formatDate(teendo.teljesitveDatuma)}</div>
          )}
          <div style={{ whiteSpace: "pre-line" }}>{teendo.reszletes}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", fontStyle: "italic" }}>
            {teendo.kanonHivatkozas}
          </div>
          {canEdit && (
            <div className="row">
              {teendo.link && (
                <button className="btn btn-secondary" onClick={() => onNavigate(teendo.link!)}>
                  Ugrás az elvégzéshez
                </button>
              )}
              <button className="btn btn-secondary" disabled={saving} onClick={toggleDone}>
                {saving
                  ? "Mentés..."
                  : teendo.allapot === "teljesitve"
                    ? "Teljesítés visszavonása"
                    : "Megjelölöm teljesítettként"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
