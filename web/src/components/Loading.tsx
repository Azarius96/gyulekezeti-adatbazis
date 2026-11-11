/** Teljes képernyős indulási betöltő (bejelentkezés-ellenőrzés közben): a címer finoman pulzál, alatta csúszó sáv. */
export function AppLoader() {
  return (
    <div className="app-loader" role="status" aria-live="polite">
      <img className="app-loader__crest" src="/favicon.png" alt="" />
      <div className="app-loader__name">Gyülekezeti adatbázis</div>
      <div className="loader-bar" />
      <span className="visually-hidden">Betöltés...</span>
    </div>
  );
}

/** Oldal-betöltő: az oldal váza (cím + kártyák) villódzó vázlatként, hogy ne ugráljon az elrendezés, amikor megjön az adat. */
export function PageLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div className="page-loader" role="status" aria-live="polite" aria-busy="true">
      {!compact && <div className="skeleton" style={{ height: 38, width: "min(320px, 60%)" }} />}
      {Array.from({ length: compact ? 1 : 2 }, (_, i) => (
        <div key={i} className="card stack" style={{ gap: 12 }}>
          <div className="skeleton" style={{ height: 22, width: "40%" }} />
          <div className="skeleton" style={{ height: 16, width: "92%" }} />
          <div className="skeleton" style={{ height: 16, width: "78%" }} />
          {!compact && <div className="skeleton" style={{ height: 16, width: "64%" }} />}
        </div>
      ))}
      <span className="visually-hidden">Betöltés...</span>
    </div>
  );
}

/** Kis forgó jelző egy-egy blokkhoz (pl. statisztika-kártya). */
export function InlineLoader() {
  return (
    <div className="row" style={{ alignItems: "center", gap: 10, color: "var(--color-text-muted)" }} role="status" aria-live="polite">
      <span className="spinner" />
      <span>Betöltés...</span>
    </div>
  );
}
