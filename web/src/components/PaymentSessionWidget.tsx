import { useState } from "react";
import { fmtLej, usePaymentSession } from "../context/PaymentSessionContext";

/** Diszkrét sarokablak: az aktuális munkamenetben rögzített befizetések összege - a nyugtára ezt a végösszeget kell írni. */
export function PaymentSessionWidget() {
  const { entries, remove, clear } = usePaymentSession();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, e) => sum + e.osszeg, 0);
  const dues = entries.filter((e) => e.kind === "dues").reduce((sum, e) => sum + e.osszeg, 0);
  const donation = total - dues;

  return (
    <div
      className="card"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 50,
        width: open ? 340 : "auto",
        maxWidth: "calc(100vw - 32px)",
        padding: "10px 14px",
        gap: 8,
        boxShadow: "0 8px 28px rgba(0, 0, 0, 0.35)",
        background: "var(--glass-bg)",
        border: "1.5px solid var(--color-border-strong)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="A mostani munkamenet befizetéseinek összege"
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 14,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--color-text)",
          font: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          Befizetések ({entries.length}) {open ? "▾" : "▴"}
        </span>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--font-size-lg)" }}>{fmtLej(total)}</strong>
      </button>
      {open && (
        <div className="stack" style={{ gap: 6 }}>
          <div style={{ maxHeight: 240, overflowY: "auto" }} className="stack">
            {entries.map((e) => (
              <div
                key={e.key}
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)", flexWrap: "nowrap" }}
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.nev}
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {" "}
                    · {e.kind === "donation" ? "adomány" : e.ev === null ? "korábbi tartozás" : e.ev}
                  </span>
                </span>
                <span style={{ whiteSpace: "nowrap" }}>
                  {fmtLej(e.osszeg)}{" "}
                  <button
                    type="button"
                    title="Kivétel az összesítőből (a rögzített befizetés nem törlődik)"
                    onClick={() => remove(e.key)}
                    style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", padding: "0 4px", font: "inherit" }}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
          </div>
          {donation > 0 && dues > 0 && (
            <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
              egyházfenntartó {fmtLej(dues)} · adomány {fmtLej(donation)}
            </div>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            {confirmClear ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    clear();
                    setConfirmClear(false);
                  }}
                >
                  Igen, új nyugta
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(false)}>
                  Mégse
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(true)}>
                Nullázás (új nyugta)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
