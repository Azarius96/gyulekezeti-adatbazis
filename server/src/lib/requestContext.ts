import { AsyncLocalStorage } from "node:async_hooks";

export interface ActorInfo {
  /** Üres, ha nem felhasználó végzi a módosítást (pl. egyszeri adatjavító szkript - ilyenkor a userNev a végrehajtó neve). */
  userId: string | null;
  userNev: string;
}

interface Store {
  actor: ActorInfo | null;
}

const als = new AsyncLocalStorage<Store>();

/**
 * Minden kérés elején (a legelső, "onRequest" hook-ban) meg kell hívni ezt - ez nyitja meg azt
 * az AsyncLocalStorage-kontextust, amiben a kérés teljes további életciklusa (a preHandlerek és
 * a route handler is) lefut, így egy később, mélyen egy service-függvényben vagy a Prisma
 * audit-naplózó rétegében is elérhető, KI hajtja végre az éppen folyó módosítást - anélkül,
 * hogy ezt minden egyes függvényhívásnak külön paraméterként tovább kellene adni.
 */
export function withRequestContext(done: () => void): void {
  als.run({ actor: null }, done);
}

/** A bejelentkezés-ellenőrzés (auth plugin) hívja meg, miután beazonosította a felhasználót. */
export function setCurrentActor(actor: ActorInfo | null): void {
  const store = als.getStore();
  if (store) store.actor = actor;
}

/** Az audit-naplózás olvassa ki, hogy egy adott módosítást ki hajtott végre. */
export function getCurrentActor(): ActorInfo | null {
  return als.getStore()?.actor ?? null;
}
