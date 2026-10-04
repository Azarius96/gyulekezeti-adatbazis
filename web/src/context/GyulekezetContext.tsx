import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { Gyulekezet } from "../lib/types";

interface GyulekezetContextValue {
  /** A kiválasztott gyülekezet azonosítója; üres = nincs szűrés (összes elérhető gyülekezet). */
  selectedId: string;
  setSelectedId: (id: string) => void;
  /** Csak a püspöki (statisztika) nézetben: a kiválasztott egyházmegye azonosítója (kölcsönösen kizárja a gyülekezet-választást). */
  selectedMegyeId: string;
  setSelectedMegyeId: (id: string) => void;
  gyulekezetek: Gyulekezet[];
}

const GyulekezetContext = createContext<GyulekezetContextValue | null>(null);

const storageKey = (userId: string) => `gyulekezet-valasztas:${userId}`;

const MEGYE_PREFIX = "megye:";

function readStored(userId: string): string {
  try {
    return localStorage.getItem(storageKey(userId)) ?? "";
  } catch {
    return "";
  }
}

/**
 * Az egész alkalmazásra érvényes gyülekezet-választás: minden fülön ugyanaz a gyülekezet adata
 * látszik, amíg a felhasználó nem vált; a választás felhasználónként megmarad újratöltés után is.
 */
export function GyulekezetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // `id` a gyülekezet azonosítója VAGY "megye:<id>" (egyházmegyei nézet, püspöknek) - a tárolt érték is ez.
  const [state, setState] = useState<{ userId: string | null; id: string }>({ userId: null, id: "" });
  const [gyulekezetek, setGyulekezetek] = useState<Gyulekezet[]>([]);

  // Felhasználóváltáskor (be-/kijelentkezés) azonnal, még a renderelés közben átállunk az adott
  // felhasználó mentett választására, hogy az oldalak első lekérdezése már a helyes szűrővel menjen.
  if (state.userId !== userId) {
    setState({ userId, id: userId ? readStored(userId) : "" });
  }

  useEffect(() => {
    if (!userId) {
      setGyulekezetek([]);
      return;
    }
    api
      .get<Gyulekezet[]>("/api/gyulekezetek")
      .then(setGyulekezetek)
      .catch(() => {});
  }, [userId]);

  function setSelectedId(id: string) {
    store(id);
  }

  function setSelectedMegyeId(id: string) {
    store(id ? MEGYE_PREFIX + id : "");
  }

  function store(id: string) {
    setState((s) => ({ ...s, id }));
    if (!userId) return;
    try {
      if (id) localStorage.setItem(storageKey(userId), id);
      else localStorage.removeItem(storageKey(userId));
    } catch {
      // a választás ilyenkor csak az aktuális munkamenetben marad meg
    }
  }

  // Ha a mentett gyülekezet már nem elérhető a felhasználónak (törölték, jogosultság változott),
  // vagy csak egyetlen gyülekezet van, visszalépünk a szűrés nélküli nézetre.
  useEffect(() => {
    if (gyulekezetek.length === 0 || !state.id) return;
    const megyeId = state.id.startsWith(MEGYE_PREFIX) ? state.id.slice(MEGYE_PREFIX.length) : null;
    const valid = megyeId ? gyulekezetek.some((g) => g.egyhazmegyeId === megyeId) : gyulekezetek.some((g) => g.id === state.id);
    if (gyulekezetek.length <= 1 || !valid) {
      store("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyulekezetek, state.id]);

  return (
    <GyulekezetContext.Provider
      value={{
        selectedId: state.id.startsWith(MEGYE_PREFIX) ? "" : state.id,
        setSelectedId,
        selectedMegyeId: state.id.startsWith(MEGYE_PREFIX) ? state.id.slice(MEGYE_PREFIX.length) : "",
        setSelectedMegyeId,
        gyulekezetek,
      }}
    >
      {children}
    </GyulekezetContext.Provider>
  );
}

export function useSelectedGyulekezet(): [string, (id: string) => void] {
  const ctx = useContext(GyulekezetContext);
  if (!ctx) throw new Error("useSelectedGyulekezet csak GyulekezetProvideren belül használható");
  return [ctx.selectedId, ctx.setSelectedId];
}

/** Püspöki nézet: a kiválasztott egyházmegye (üres = nincs egyházmegye kiválasztva). */
export function useSelectedMegye(): [string, (id: string) => void] {
  const ctx = useContext(GyulekezetContext);
  if (!ctx) throw new Error("useSelectedMegye csak GyulekezetProvideren belül használható");
  return [ctx.selectedMegyeId, ctx.setSelectedMegyeId];
}

export function useGyulekezetContext() {
  const ctx = useContext(GyulekezetContext);
  if (!ctx) throw new Error("useGyulekezetContext csak GyulekezetProvideren belül használható");
  return ctx;
}
