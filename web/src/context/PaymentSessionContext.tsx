import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface SessionPayment {
  key: string;
  personId: string;
  nev: string;
  kind: "dues" | "donation";
  /** null: a nyitó (korábbi) tartozás törlesztése - nem egy konkrét évre szól. */
  ev: number | null;
  osszeg: number;
}

interface PaymentSessionValue {
  entries: SessionPayment[];
  /** Minden rögzített befizetés után nő - az oldalak ebből tudják, hogy frissíteniük kell az adataikat. */
  version: number;
  record: (p: Omit<SessionPayment, "key">) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "befizetesek-munkamenet";
const PaymentSessionContext = createContext<PaymentSessionValue | null>(null);

function readStored(): SessionPayment[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionPayment[]) : [];
  } catch {
    return [];
  }
}

/** Az aktuális munkamenetben rögzített befizetések összesítője (a nyugtára kerülő végösszeghez) és a frissítés-jelző. */
export function PaymentSessionProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<SessionPayment[]>(readStored);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // tárolás nélkül is működik, csak oldalfrissítéskor elvész az összesítő
    }
  }, [entries]);

  const record = useCallback((p: Omit<SessionPayment, "key">) => {
    setEntries((prev) => [...prev, { ...p, key: `${Date.now()}-${prev.length}-${Math.random().toString(36).slice(2, 7)}` }]);
    setVersion((v) => v + 1);
  }, []);
  const remove = useCallback((key: string) => setEntries((prev) => prev.filter((e) => e.key !== key)), []);
  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo(() => ({ entries, version, record, remove, clear }), [entries, version, record, remove, clear]);
  return <PaymentSessionContext.Provider value={value}>{children}</PaymentSessionContext.Provider>;
}

export function usePaymentSession(): PaymentSessionValue {
  const ctx = useContext(PaymentSessionContext);
  if (!ctx) throw new Error("usePaymentSession a PaymentSessionProvider-en belül használható");
  return ctx;
}

/** Újratölti az oldal adatait, amint (bárhol) egy befizetés rögzítésre kerül - böngészőfrissítés nélkül. */
export function useReloadOnPayment(load: () => void) {
  const { version } = usePaymentSession();
  const seen = useRef(version);
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    if (version === seen.current) return;
    seen.current = version;
    latest.current();
  }, [version]);
}

export const fmtLej = (n: number) => `${Math.round(n * 100) / 100} lej`;
