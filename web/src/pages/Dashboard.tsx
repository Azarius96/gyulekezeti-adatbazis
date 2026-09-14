import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { DashboardStats } from "../lib/types";
import { isAdmin } from "../lib/types";
import { GyulekezetSelect, useGyulekezetek } from "../components/GyulekezetSelect";
import { EventsBoard } from "../components/EventsBoard";
import {
  IconUsers,
  IconCross,
  IconOrgChart,
  IconHome,
  IconWallet,
  IconChevronRight,
  IconBook,
} from "../components/icons";
import type { ComponentType, SVGProps } from "react";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 10) return "Jó reggelt";
  if (h < 18) return "Jó napot";
  return "Jó estét";
}

function firstName(nev: string | undefined): string {
  if (!nev) return "";
  const parts = nev.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function StatCard({
  label,
  value,
  to,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number | string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: "primary" | "muted" | "accent" | "blue";
}) {
  const toneClass = {
    primary: "icon-tile--green",
    muted: "icon-tile--muted",
    accent: "icon-tile--orange",
    blue: "icon-tile--teal",
  }[tone];

  return (
    <Link
      to={to}
      className="card"
      style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column" }}
    >
      <div className={`icon-tile ${toneClass}`} style={{ marginBottom: 14 }}>
        <Icon style={{ width: 22, height: 22 }} />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-xl)", fontWeight: 800, color: "var(--color-text)", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ color: "var(--color-text-muted)", marginTop: 6, minHeight: 60, lineHeight: 1.5 }}>{label}</div>
    </Link>
  );
}

function initials(nev: string): string {
  const parts = nev.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "most";
  if (mins < 60) return `${mins} perce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "tegnap";
  if (days < 7) return `${days} napja`;
  return new Date(iso).toLocaleDateString("hu-HU");
}

interface QuickAction {
  label: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  // Ha igaz, csak adminnak/esperesnek/püspöknek jelenik meg - ugyanaz a szabály, mint a bal
  // oldali navigációban (a lelkész számára a szervezeti felépítés nem releváns). Az ilyen elemek
  // mindig a lista végére kerülnek, hogy a mindenki számára elérhető műveletek elöl legyenek.
  restricted?: boolean;
}

const quickActions: QuickAction[] = [
  { label: "Háztartások kezelése", to: "/haztartasok", icon: IconHome },
  { label: "Pénzügyek áttekintése", to: "/penzugyek", icon: IconWallet },
  { label: "Temető kezelése", to: "/temeto", icon: IconCross },
  { label: "Anyakönyvek", to: "/anyakonyvek", icon: IconBook },
  { label: "Szervezeti felépítés", to: "/szervezet", icon: IconOrgChart, restricted: true },
];

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gyulekezetId, setGyulekezetId] = useState("");
  const gyulekezetek = useGyulekezetek();

  useEffect(() => {
    api
      .get<DashboardStats>(`/api/dashboard/stats${gyulekezetId ? `?gyulekezetId=${gyulekezetId}` : ""}`)
      .then(setStats)
      .catch(() => setError("Nem sikerült betölteni az adatokat"));
  }, [gyulekezetId]);

  const gy = gyulekezetId ? `&gyulekezetId=${gyulekezetId}` : "";
  const currentYear = new Date().getFullYear();

  const canSeeSzervezet =
    isAdmin(user) || (user?.roles.some((r) => r.szerepKor === "ESPERES" || r.szerepKor === "PUSPOK") ?? false);
  const visibleQuickActions = quickActions.filter((a) => !a.restricted || canSeeSzervezet);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>
            {greeting()}, {firstName(user?.nev)}! 👋
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>Áttekintés a gyülekezet aktuális helyzetéről.</p>
        </div>
        <GyulekezetSelect value={gyulekezetId} onChange={setGyulekezetId} gyulekezetek={gyulekezetek} />
      </div>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="card stack">
        <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Gyors műveletek</h2>
        <div className="card-grid">
          {visibleQuickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.to}
                to={a.to}
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "nowrap",
                  textDecoration: "none",
                  color: "var(--color-text)",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-surface-alt)",
                }}
              >
                <span className="row" style={{ alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
                  <Icon style={{ width: 19, height: 19, color: "var(--color-primary-dark)", flexShrink: 0 }} />
                  {a.label}
                </span>
                <IconChevronRight style={{ width: 17, height: 17, color: "var(--color-text-muted)", flexShrink: 0 }} />
              </Link>
            );
          })}
        </div>
      </div>

      {stats && (
        <>
          <div className="card-grid">
            <StatCard label="Összlétszám (élő tagok)" value={stats.osszlétszám} to={`/haztartasok?elhunyt=false${gy}`} icon={IconUsers} tone="blue" />
            <StatCard
              label={`Elhunytak (${currentYear})`}
              value={stats.elhunytakIdenre}
              to={`/haztartasok?elhunyt=true${gy}`}
              icon={IconCross}
              tone="muted"
            />
          </div>

          <div className="card stack" style={{ padding: 0 }}>
            {[
              { label: "Férfiak", value: stats.ferfiak, to: `/haztartasok?elhunyt=false&nem=FERFI${gy}` },
              { label: "Nők", value: stats.nok, to: `/haztartasok?elhunyt=false&nem=NO${gy}` },
              { label: "18 év alattiak", value: stats.fiatalkoruak, to: `/haztartasok?elhunyt=false&korIg=17${gy}` },
              {
                label: "Konfirmáló korúak (12-14 év)",
                value: stats.konfirmaloKoruak,
                to: `/haztartasok?elhunyt=false&korTol=12&korIg=14${gy}`,
              },
              { label: "Presbiterek", value: stats.presbiterek, to: `/haztartasok?tisztseg=PRESBITER,POTPRESBITER${gy}` },
              { label: "Gondnokok", value: stats.gondnokok, to: `/haztartasok?tisztseg=GONDNOK,FOGONDNOK${gy}` },
              { label: "Nőszövetségi tagok", value: stats.noszovetseg, to: `/haztartasok?tisztseg=NOSZOVETSEGI_TAG${gy}` },
            ].map((row, i, arr) => (
              <Link
                key={row.label}
                to={row.to}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "12px 18px",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--color-border)" : "none",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="row" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
        {stats && (
          <div className="card stack" style={{ flex: "2 1 420px" }}>
            <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Kor szerinti megoszlás</h2>
            <div className="row" style={{ alignItems: "center", flexWrap: "nowrap", gap: "var(--space-3)" }}>
              <div style={{ width: 180, height: 180, flexShrink: 0, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.korEloszlas} dataKey="count" nameKey="label" innerRadius={55} outerRadius={82} paddingAngle={2} stroke="none">
                      {stats.korEloszlas.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26 }}>{stats.osszlétszám}</div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>összesen</div>
                </div>
              </div>
              <div className="stack" style={{ gap: 10, flex: 1 }}>
                {stats.korEloszlas.map((b, i) => (
                  <div key={b.label} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="row" style={{ alignItems: "center", gap: 8 }}>
                      <span style={{ width: 11, height: 11, borderRadius: "50%", background: CHART_COLORS[i % CHART_COLORS.length], display: "inline-block" }} />
                      {b.label}
                    </span>
                    <strong>
                      {b.count}{" "}
                      <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                        ({stats.osszlétszám > 0 ? Math.round((b.count / stats.osszlétszám) * 100) : 0}%)
                      </span>
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div style={{ flex: "1 1 320px" }}>
          <EventsBoard gyulekezetId={gyulekezetId} />
        </div>
      </div>

      {stats && (
        <div className="card stack">
          <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>Legutóbbi aktivitás</h2>
          {stats.legutobbiAktivitas.length === 0 && (
            <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Még nincs rögzített tevékenység.</p>
          )}
          {stats.legutobbiAktivitas.map((a) => (
            <Link
              key={a.id}
              to={`/szemelyek/${a.personId}`}
              className="row"
              style={{ alignItems: "center", justifyContent: "space-between", textDecoration: "none", color: "inherit" }}
            >
              <span className="row" style={{ alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
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
                  {initials(a.nev)}
                </span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nev}</div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{a.leiras}</div>
                </span>
              </span>
              <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>{timeAgo(a.idopont)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
