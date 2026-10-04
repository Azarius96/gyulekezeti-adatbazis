import { useState, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isAdmin, ownGyulekezetIds } from "../lib/types";
import { TopBar } from "./TopBar";
import { GyulekezetSelect } from "./GyulekezetSelect";
import { useGyulekezetContext } from "../context/GyulekezetContext";
import {
  IconDashboard,
  IconHome,
  IconWallet,
  IconCross,
  IconChurch,
  IconOrgChart,
  IconUsers,
  IconUpload,
  IconLogout,
  IconChevronDown,
  IconBook,
  IconHistory,
  IconDownload,
  IconClock,
  IconTrash,
} from "./icons";

const navItems = [
  { to: "/", label: "Áttekintés", end: true, icon: IconDashboard, tone: "blue" },
  { to: "/haztartasok", label: "Háztartások", icon: IconHome, tone: "orange" },
  { to: "/penzugyek", label: "Pénzügyek", icon: IconWallet, tone: "green" },
  { to: "/temeto", label: "Temető", icon: IconCross, tone: "graphite" },
  { to: "/anyakonyvek", label: "Anyakönyvek", icon: IconBook, tone: "purple" },
  { to: "/dokumentumok", label: "Letölthető dokumentumok", end: false, icon: IconDownload, tone: "muted" },
  { to: "/valtozas-tortenet", label: "Változás-történet", end: false, icon: IconClock, tone: "indigo" },
  { to: "/papirkosar", label: "Papírkosár", end: false, icon: IconTrash, tone: "muted" },
];

// Egy sima lelkésznek nem releváns (a saját gyülekezetén túlmutató szervezeti áttekintést ad) -
// csak esperesnek/püspöknek/adminnak jelenik meg, ld. Layout() `items` összeállítását.
const szervezetNavItem = { to: "/szervezet", label: "Szervezeti felépítés", end: false, icon: IconOrgChart, tone: "teal" };

const gyulekezetekNavItem = { to: "/gyulekezetek", label: "Gyülekezetek", end: false, icon: IconChurch, tone: "indigo" };

const adminNavItems = [
  gyulekezetekNavItem,
  { to: "/felhasznalok", label: "Felhasználók", end: false, icon: IconUsers, tone: "pink" },
  { to: "/import", label: "Excel import", end: false, icon: IconUpload, tone: "red" },
  { to: "/mentesek", label: "Biztonsági mentések", end: false, icon: IconHistory, tone: "indigo" },
];

function initials(nev: string | undefined): string {
  if (!nev) return "?";
  const parts = nev.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isEsperes = user?.roles.some((r) => r.szerepKor === "ESPERES") ?? false;
  const isEsperesOrPuspok = user?.roles.some((r) => r.szerepKor === "ESPERES" || r.szerepKor === "PUSPOK") ?? false;
  const admin = isAdmin(user);
  const items = [
    ...navItems,
    ...(admin || isEsperesOrPuspok ? [szervezetNavItem] : []),
    ...(admin ? adminNavItems : isEsperes || ownGyulekezetIds(user).length > 0 ? [gyulekezetekNavItem] : []),
  ];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { selectedId, setSelectedId, gyulekezetek } = useGyulekezetContext();

  async function handleLogout() {
    await logout();
    navigate("/bejelentkezes");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 39,
          }}
          className="sidebar-overlay"
        />
      )}
      <nav
        className={`app-sidebar${mobileNavOpen ? " app-sidebar--open" : ""}`}
        style={{
          width: 264,
          flexShrink: 0,
          background: "rgba(14, 22, 46, 0.5)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderRight: "1px solid var(--color-border)",
          padding: "var(--space-3) var(--space-2)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px 22px" }}>
          <div className="icon-tile icon-tile--blue" style={{ width: 38, height: 38, borderRadius: 11 }}>
            <IconChurch style={{ width: 20, height: 20 }} />
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              color: "var(--color-text)",
            }}
          >
            Gyülekezeti
            <br />
            adatbázis
          </div>
        </div>

        {gyulekezetek.length > 1 && (
          <div style={{ padding: "0 8px 12px" }}>
            <GyulekezetSelect value={selectedId} onChange={setSelectedId} gyulekezetek={gyulekezetek} />
          </div>
        )}

        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span
                className={`icon-tile icon-tile--${item.tone}`}
                style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0 }}
              >
                <Icon style={{ width: 16, height: 16 }} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        <div style={{ marginTop: "auto", paddingTop: "var(--space-2)", position: "relative" }} ref={menuRef}>
          {menuOpen && (
            <div className="menu-panel" style={{ bottom: "calc(100% + 8px)", left: 8, right: 8 }} onMouseLeave={() => setMenuOpen(false)}>
              <button className="menu-item" onClick={handleLogout}>
                <IconLogout style={{ width: 18, height: 18 }} />
                Kijelentkezés
              </button>
            </div>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 14,
              background: "var(--color-surface-alt)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              className="icon-tile icon-tile--orange"
              style={{ width: 38, height: 38, borderRadius: "50%", fontWeight: 800, fontSize: 14 }}
            >
              {initials(user?.nev)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }}>
                {user?.nev}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--color-text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.roles.map((r) => r.szerepKor).join(", ")}
              </div>
            </div>
            <IconChevronDown style={{ width: 16, height: 16, color: "var(--color-text-muted)", flexShrink: 0 }} />
          </button>
        </div>
      </nav>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar onMenuClick={() => setMobileNavOpen((v) => !v)} />
        <main className="app-main" style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
