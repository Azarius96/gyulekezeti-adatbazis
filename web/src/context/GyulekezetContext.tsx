import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { Gyulekezet } from "../lib/types";

interface GyulekezetContextValue {
  /** A kiválasztott gyülekezet azonosítója; üres = nincs szűrés (összes elérhető gyülekezet). */
  selectedId: string;
  setSelectedId: (id: string) => void;
  gyulekezetek: Gyulekezet[];
}

const GyulekezetContext = createContext<GyulekezetContextValue | null>(null);

const storageKey = (userId: string) => `gyulekezet-valasztas:${userId}`;

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
    if (gyulekezetek.length <= 1 || !gyulekezetek.some((g) => g.id === state.id)) {
      setSelectedId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gyulekezetek, state.id]);

  return (
    <GyulekezetContext.Provider value={{ selectedId: state.id, setSelectedId, gyulekezetek }}>
      {children}
    </GyulekezetContext.Provider>
  );
}

export function useSelectedGyulekezet(): [string, (id: string) => void] {
  const ctx = useContext(GyulekezetContext);
  if (!ctx) throw new Error("useSelectedGyulekezet csak GyulekezetProvideren belül használható");
  return [ctx.selectedId, ctx.setSelectedId];
}

export function useGyulekezetContext() {
  const ctx = useContext(GyulekezetContext);
  if (!ctx) throw new Error("useGyulekezetContext csak GyulekezetProvideren belül használható");
  return ctx;
}
