import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE } from "../lib/api";
import type { PersonListItem } from "../lib/types";
import { IconDownload } from "../components/icons";
import { useSelectedGyulekezet } from "../context/GyulekezetContext";

function DocumentCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="card stack">
      <h2 style={{ fontSize: "var(--font-size-lg)", margin: 0 }}>{title}</h2>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>{description}</p>
      {children}
    </div>
  );
}

function SzemelyKereso({ hrefBuilder, linkLabel }: { hrefBuilder: (id: string) => string; linkLabel: string }) {
  const [gyulekezetId] = useSelectedGyulekezet();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonListItem[]>([]);
  const [loading, setLoading] = useState(false);

  function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    api
      .get<PersonListItem[]>(`/api/persons?q=${encodeURIComponent(value)}${gyulekezetId ? `&gyulekezetId=${gyulekezetId}` : ""}`)
      .then((res) => setResults(res.slice(0, 12)))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="szemely-kereso">Keresse meg a személyt</label>
        <input id="szemely-kereso" value={q} onChange={(e) => search(e.target.value)} placeholder="pl. Kovács János" />
      </div>
      {loading && <p style={{ color: "var(--color-text-muted)" }}>Keresés...</p>}
      {results.length > 0 && (
        <div className="stack" style={{ gap: 2 }}>
          {results.map((p) => (
            <Link key={p.id} to={hrefBuilder(p.id)} className="list-row row" style={{ justifyContent: "space-between" }}>
              <span>
                {p.vezeteknev} {p.keresztnev}
              </span>
              <span style={{ color: "var(--color-text-muted)" }}>{linkLabel} →</span>
            </Link>
          ))}
        </div>
      )}
      {!loading && q.trim().length >= 2 && results.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Nincs találat.</p>}
    </div>
  );
}

export function Dokumentumok() {
  const [gyulekezetId] = useSelectedGyulekezet();
  return (
    <div className="stack">
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Letölthető dokumentumok</h1>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        Innen bármikor letölthetők a gyülekezet hivatalos jelentései és a személyekre vonatkozó adatlapok.
      </p>

      <DocumentCard
        title="Teljes adatexport (Excel)"
        description="Az elérhető gyülekezet(ek) összes rögzített adata egyetlen táblában, soronként egy személlyel — biztonsági másolatként vagy egyházmegyei/kerületi jelentéshez."
      >
        <a className="btn btn-secondary" style={{ alignSelf: "flex-start" }} href={`${API_BASE}/api/export/szemelyek${gyulekezetId ? `?gyulekezetId=${gyulekezetId}` : ""}`}>
          <IconDownload style={{ width: 18, height: 18 }} /> Letöltés Excelben
        </a>
      </DocumentCard>

      <DocumentCard
        title="Választói névjegyzék"
        description="A Kánon 12. §. a) és 37. §. szerint automatikusan összeállított jogosultlista, aláírási sorokkal és esperesi záradékkal — bármikor megnyitható, kitölthető és nyomtatható."
      >
        <Link className="btn btn-secondary" style={{ alignSelf: "flex-start" }} to="/valasztoi-nevjegyzek">
          Megnyitás →
        </Link>
      </DocumentCard>

      <DocumentCard
        title="Hivatalos igazolások"
        description="Keresztelési, konfirmációi, házasságkötési, egyháztagsági, temetési és átiratkozó igazolás hivatalos levélformában, iktatószámmal, címzettel és céllal — magyar, román vagy angol nyelven."
      >
        <SzemelyKereso hrefBuilder={(id) => `/szemelyek/${id}/igazolas`} linkLabel="Igazolás" />
      </DocumentCard>

      <DocumentCard
        title="Lélekszám statisztika"
        description="A gyülekezet lélekszámával kapcsolatos mutatók (keresztelés, elhalálozás, december végi lélekszám, választói névjegyzék, háztartások, házasságok) áttekintése a rendszer adataiból — tájékoztató jellegű, nem letölthető."
      >
        <Link className="btn btn-secondary" style={{ alignSelf: "flex-start" }} to="/lelekszam-jelentes">
          Megnyitás →
        </Link>
      </DocumentCard>
    </div>
  );
}
