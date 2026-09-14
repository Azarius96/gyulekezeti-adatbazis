import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { paymentDaysLeft } from "../lib/types";
import { IconSearch, IconBell, IconLogout, IconHeart, IconMenu } from "./icons";

const SUPPORT_URL = "https://revolut.me/laszlo37zx";

interface PersonResult {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  elhunyt: boolean;
}

interface PendingEvent {
  id: string;
  cim: string;
  datuma: string;
  szint: "HELYI" | "MEGYEI" | "KERULETI";
  gyulekezet: { nev: string } | null;
}

interface TeendoStatus {
  id: string;
  cim: string;
  rovidLeiras: string;
  kanonHivatkozas: string;
  reszletes: string;
  hataridoDatum: string | null;
  allapot: "lejart" | "hamarosan" | "folyamatos" | "tavoli" | "teljesitve";
  link?: string;
}

interface TeendoGyulekezetGroup {
  gyulekezetId: string;
  gyulekezetNev: string;
  teendok: TeendoStatus[];
}

interface IncomingMovingPerson {
  id: string;
  vezeteknev: string;
  keresztnev: string;
  nem: "FERFI" | "NO";
  szuletesiDatum: string | null;
  szuletesiHely: string | null;
  vallas: string | null;
  csaladiAllapot: string | null;
  megjegyzes: string | null;
  baptism: { datuma: string; helye: string | null } | null;
  confirmation: { datuma: string; helye: string | null } | null;
}

interface IncomingMoving {
  id: string;
  regiCim: string;
  ujCim: string;
  indoklas: string | null;
  kezdemenyezve: string;
  person: IncomingMovingPerson;
  forrasGyulekezet: { nev: string } | null;
}

const teendoAllapotLabel: Record<TeendoStatus["allapot"], string> = {
  lejart: "lejárt",
  hamarosan: "hamarosan esedékes",
  folyamatos: "folyamatos",
  tavoli: "",
  teljesitve: "teljesítve",
};

const szintLabels: Record<string, string> = {
  HELYI: "Helyi",
  MEGYEI: "Megyei",
  KERULETI: "Kerületi",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
}

function initials(nev: string | undefined): string {
  if (!nev) return "?";
  const parts = nev.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pending, setPending] = useState<PendingEvent[]>([]);
  const [teendoGroups, setTeendoGroups] = useState<TeendoGyulekezetGroup[]>([]);
  const [incomingMoving, setIncomingMoving] = useState<IncomingMoving[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function loadPending() {
    api
      .get<PendingEvent[]>("/api/events/pending")
      .then(setPending)
      .catch(() => setPending([]));
  }

  function loadTeendok() {
    api
      .get<TeendoGyulekezetGroup[]>("/api/teendok/urgent")
      .then(setTeendoGroups)
      .catch(() => setTeendoGroups([]));
  }

  function loadIncomingMoving() {
    api
      .get<IncomingMoving[]>("/api/moving-requests/incoming")
      .then(setIncomingMoving)
      .catch(() => setIncomingMoving([]));
  }

  useEffect(loadPending, []);
  useEffect(loadTeendok, []);
  useEffect(loadIncomingMoving, []);

  const teendoCount = teendoGroups.reduce((sum, g) => sum + g.teendok.length, 0);

  async function approve(id: string) {
    await api.put(`/api/events/${id}/approve`);
    loadPending();
  }

  async function reject(id: string) {
    await api.put(`/api/events/${id}/reject`);
    loadPending();
  }

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<PersonResult[]>(`/api/persons?q=${encodeURIComponent(query)}`)
        .then((rows) => setResults(rows.slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
      }
    }
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  function goToPerson(id: string) {
    setSearchOpen(false);
    setQuery("");
    navigate(`/szemelyek/${id}`);
  }

  async function handleLogout() {
    await logout();
    navigate("/bejelentkezes");
  }

  const daysLeft = paymentDaysLeft(user);

  return (
    <>
      {daysLeft !== null && daysLeft <= 30 && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 31,
            padding: "8px var(--space-4)",
            background: "var(--color-danger)",
            color: "#fff",
            fontSize: "var(--font-size-sm)",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {daysLeft > 0
            ? `Figyelem: az előfizetése ${daysLeft} nap múlva lejár. Kérjük, egyeztessen a rendszergazdával a hozzáférés fenntartásához.`
            : "Az előfizetése lejárt. Kérjük, egyeztessen a rendszergazdával a hozzáférés helyreállításához."}
        </div>
      )}
      <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "16px var(--space-4)",
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "rgba(14, 22, 46, 0.55)",
        backdropFilter: "blur(20px) saturate(1.8)",
        WebkitBackdropFilter: "blur(20px) saturate(1.8)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <button
        className="hamburger-btn icon-btn-round"
        onClick={onMenuClick}
        title="Menü"
        style={{
          placeItems: "center",
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-muted)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <IconMenu style={{ width: 20, height: 20 }} />
      </button>
      <div ref={searchRef} style={{ position: "relative", flex: 1, maxWidth: 480 }}>
        <div style={{ position: "relative" }}>
          <IconSearch
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              width: 19,
              height: 19,
              color: "var(--color-text-muted)",
            }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Keresés személyre, háztartásra..."
            style={{ width: "100%", paddingLeft: 44, paddingRight: 60 }}
          />
          <span
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              color: "var(--color-text-muted)",
              background: "var(--color-surface-alt)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "2px 6px",
              pointerEvents: "none",
            }}
          >
            ⌘K
          </span>
        </div>
        {searchOpen && query.trim() && (
          <div className="menu-panel" style={{ top: "calc(100% + 6px)", left: 0, right: 0 }}>
            {results.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                Nincs találat.
              </div>
            ) : (
              results.map((p) => (
                <button key={p.id} className="menu-item" onClick={() => goToPerson(p.id)}>
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: "var(--color-primary-light)",
                      color: "var(--color-primary-dark)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {initials(`${p.vezeteknev} ${p.keresztnev}`)}
                  </span>
                  <span>
                    {p.vezeteknev} {p.keresztnev}
                    {p.elhunyt && <span style={{ color: "var(--color-text-muted)" }}> (elhunyt)</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Támogasd a munkám"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-sm)",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <IconHeart style={{ width: 16, height: 16, color: "var(--color-danger)" }} />
          <span className="support-label">Támogasd a munkám</span>
        </a>
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            title="Értesítések"
            className="icon-btn-round"
            style={{
              position: "relative",
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              color: "var(--color-text-muted)",
            }}
          >
            <IconBell style={{ width: 20, height: 20 }} />
            {(pending.length > 0 || teendoCount > 0 || incomingMoving.length > 0) && (
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: "var(--color-danger)",
                  border: "2px solid var(--color-surface)",
                }}
              />
            )}
          </button>
          {notifOpen && (
            <div className="menu-panel" style={{ top: "calc(100% + 8px)", right: 0, width: 380, maxHeight: 480, overflowY: "auto" }}>
              {teendoCount > 0 && (
                <>
                  <div style={{ padding: "8px 12px 10px" }}>
                    <strong>Törvényben előírt teendők</strong>
                  </div>
                  <div className="stack" style={{ gap: 4, padding: "0 4px 6px" }}>
                    {teendoGroups.map((g) => (
                      <div key={g.gyulekezetId} className="stack" style={{ gap: 4 }}>
                        {teendoGroups.length > 1 && (
                          <div style={{ padding: "2px 8px", color: "var(--color-text-muted)", fontSize: 12, fontWeight: 700 }}>
                            {g.gyulekezetNev}
                          </div>
                        )}
                        {g.teendok.map((t) => (
                          <TeendoRow
                            key={t.id}
                            teendo={t}
                            gyulekezetId={g.gyulekezetId}
                            onDone={() => {
                              loadTeendok();
                            }}
                            onNavigate={(to) => {
                              setNotifOpen(false);
                              navigate(to);
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <button
                    className="menu-item"
                    style={{ borderTop: "1px solid var(--color-border)", borderRadius: 0, paddingTop: 10, marginBottom: 6 }}
                    onClick={() => {
                      setNotifOpen(false);
                      navigate("/teendok");
                    }}
                  >
                    Összes teendő megtekintése
                  </button>
                </>
              )}
              {incomingMoving.length > 0 && (
                <>
                  <div style={{ padding: "8px 12px 10px" }}>
                    <strong>Beérkező költözések</strong>
                  </div>
                  <div className="stack" style={{ gap: 4, padding: "0 4px 6px" }}>
                    {incomingMoving.map((m) => (
                      <IncomingMovingRow
                        key={m.id}
                        item={m}
                        onDone={() => {
                          loadIncomingMoving();
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
              <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid var(--color-border)", marginBottom: 6 }}>
                <strong>Jóváhagyásra váró események</strong>
              </div>
              {pending.length === 0 ? (
                <div style={{ padding: "10px 12px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                  Nincs jóváhagyásra váró esemény.
                </div>
              ) : (
                <div className="stack" style={{ gap: 4, padding: "0 4px" }}>
                  {pending.map((e) => (
                    <div key={e.id} className="stack" style={{ gap: 6, padding: "8px 8px", borderRadius: "var(--radius-sm)" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "var(--font-size-sm)" }}>{e.cim}</div>
                        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                          {formatDate(e.datuma)} · {szintLabels[e.szint]}
                          {e.gyulekezet ? ` · ${e.gyulekezet.nev}` : ""}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
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
              <button
                className="menu-item"
                style={{ marginTop: 6, borderTop: "1px solid var(--color-border)", borderRadius: 0, paddingTop: 10 }}
                onClick={() => {
                  setNotifOpen(false);
                  navigate("/");
                }}
              >
                Összes esemény megtekintése
              </button>
            </div>
          )}
        </div>

        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="icon-tile icon-tile--orange icon-btn-round"
            style={{ width: 42, height: 42, borderRadius: "50%", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer" }}
          >
            {initials(user?.nev)}
          </button>
          {userMenuOpen && (
            <div className="menu-panel" style={{ top: "calc(100% + 8px)", right: 0, minWidth: 220 }}>
              <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid var(--color-border)", marginBottom: 6 }}>
                <div style={{ fontWeight: 700 }}>{user?.nev}</div>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                  {user?.roles.map((r) => r.szerepKor).join(", ")}
                </div>
              </div>
              <button className="menu-item" onClick={handleLogout}>
                <IconLogout style={{ width: 18, height: 18 }} />
                Kijelentkezés
              </button>
            </div>
          )}
        </div>
      </div>
      </header>
    </>
  );
}

function IncomingMovingRow({ item, onDone }: { item: IncomingMoving; onDone: () => void }) {
  const [accepting, setAccepting] = useState(false);
  const [telepules, setTelepules] = useState("");
  const [utca, setUtca] = useState("");
  const [hazszam, setHazszam] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = item.person;
  const age = p.szuletesiDatum ? new Date().getFullYear() - Number(p.szuletesiDatum.slice(0, 4)) : null;

  async function handleAccept() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/moving-requests/${item.id}/accept`, { telepules, utca, hazszam });
      onDone();
    } catch {
      setError("Nem sikerült elfogadni - ellenőrizze a megadott címet");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    await api.post(`/api/moving-requests/${item.id}/reject`);
    onDone();
  }

  return (
    <div className="stack" style={{ gap: 6, padding: "8px 8px", borderRadius: "var(--radius-sm)" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: "var(--font-size-sm)" }}>
          {p.vezeteknev} {p.keresztnev}
          {age !== null && <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> ({age} év)</span>}
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          {item.forrasGyulekezet?.nev ?? "ismeretlen gyülekezet"} · {item.regiCim || "ismeretlen cím"}
          {item.indoklas ? ` · ${item.indoklas}` : ""}
        </div>
      </div>
      {!accepting ? (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setAccepting(true)}>
            Elfogadás
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleReject}>
            Elutasítás
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Adja meg az új (ittlévő) címet:</span>
          <input placeholder="Település" value={telepules} onChange={(e) => setTelepules(e.target.value)} />
          <input placeholder="Utca" value={utca} onChange={(e) => setUtca(e.target.value)} />
          <input placeholder="Házszám" value={hazszam} onChange={(e) => setHazszam(e.target.value)} />
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={saving || !telepules || !utca || !hazszam}
              onClick={handleAccept}
            >
              {saving ? "Mentés..." : "Megerősítés"}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAccepting(false)}>
              Mégse
            </button>
          </div>
          {error && <span style={{ color: "var(--color-danger)", fontSize: 12 }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

function TeendoRow({
  teendo,
  gyulekezetId,
  onDone,
  onNavigate,
}: {
  teendo: TeendoStatus;
  gyulekezetId: string;
  onDone: () => void;
  onNavigate: (to: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  async function markDone() {
    setSaving(true);
    try {
      await api.post(`/api/teendok/${teendo.id}/teljesit`, { gyulekezetId });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6, padding: "8px 8px", borderRadius: "var(--radius-sm)" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="list-row"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "4px 6px",
          background: "none",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
          textAlign: "left",
        }}
      >
        <span>
          <div style={{ fontWeight: 700, fontSize: "var(--font-size-sm)" }}>{teendo.cim}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            {teendo.hataridoDatum ? `Határidő: ${formatDate(teendo.hataridoDatum)}` : "Folyamatos kötelezettség"}
          </div>
        </span>
        <span
          className="badge-sm"
          style={
            teendo.allapot === "lejart"
              ? { borderColor: "var(--color-danger)", color: "var(--color-danger)" }
              : { borderColor: "var(--color-accent)", color: "var(--color-accent)" }
          }
        >
          {teendoAllapotLabel[teendo.allapot]}
        </span>
      </button>
      {expanded && (
        <div className="stack" style={{ gap: 8, padding: "4px 6px 2px" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "pre-line" }}>{teendo.reszletes}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>{teendo.kanonHivatkozas}</div>
          <div className="row" style={{ gap: 6 }}>
            {teendo.link && (
              <button className="btn btn-secondary btn-sm" onClick={() => onNavigate(teendo.link!)}>
                Ugrás az elvégzéshez
              </button>
            )}
            <button className="btn btn-secondary btn-sm" disabled={saving} onClick={markDone}>
              {saving ? "Mentés..." : "Megjelölöm teljesítettként"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
