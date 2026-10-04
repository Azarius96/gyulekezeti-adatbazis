import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { canEditGyulekezet, isAdmin, isStatsOnly, type Gyulekezet } from "../lib/types";
import { useGyulekezetContext } from "../context/GyulekezetContext";

export function useGyulekezetek() {
  const [gyulekezetek, setGyulekezetek] = useState<Gyulekezet[]>([]);
  useEffect(() => {
    api.get<Gyulekezet[]>("/api/gyulekezetek").then(setGyulekezetek).catch(() => {});
  }, []);
  return gyulekezetek;
}

export function GyulekezetSelect({
  value,
  onChange,
  gyulekezetek,
}: {
  value: string;
  onChange: (id: string) => void;
  gyulekezetek: Gyulekezet[];
}) {
  const { user } = useAuth();
  const { selectedMegyeId, setSelectedMegyeId } = useGyulekezetContext();
  if (gyulekezetek.length <= 1) return null;

  // Püspök (csak statisztika): általános nézet, egyházmegyénként összesített nézetek és az egyes gyülekezetek.
  if (isStatsOnly(user)) {
    const megyek = Array.from(
      new Map(gyulekezetek.filter((g) => g.egyhazmegye).map((g) => [g.egyhazmegye!.id, g.egyhazmegye!.nev])).entries()
    );
    const current = selectedMegyeId ? `megye:${selectedMegyeId}` : value;
    return (
      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="gyulekezet-select">Nézet</label>
        <select
          id="gyulekezet-select"
          value={current}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("megye:")) setSelectedMegyeId(v.slice(6));
            else onChange(v);
          }}
        >
          <option value="">Általános nézet (összes gyülekezet)</option>
          {megyek.length > 0 && (
            <optgroup label="Egyházmegyék">
              {megyek.map(([id, nev]) => (
                <option key={id} value={`megye:${id}`}>
                  {nev}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Gyülekezetek">
            {gyulekezetek.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nev}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    );
  }

  // Esperesnek (nem adminnak) a lista két, jól elhatárolt csoportra bomlik: a saját (szerkeszthető)
  // gyülekezetei, és az egyházmegye többi gyülekezete, amit csak megtekinthet (dőlt betűvel jelezve).
  const isEsperes = !isAdmin(user) && (user?.roles.some((r) => r.szerepKor === "ESPERES") ?? false);
  const sajat = isEsperes ? gyulekezetek.filter((g) => canEditGyulekezet(user, g.id)) : gyulekezetek;
  const tobbi = isEsperes ? gyulekezetek.filter((g) => !canEditGyulekezet(user, g.id)) : [];

  return (
    <div className="field" style={{ maxWidth: 320 }}>
      <label htmlFor="gyulekezet-select">Gyülekezet</label>
      <select id="gyulekezet-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{isEsperes ? "Esperesi nézet (teljes egyházmegye)" : "Összes gyülekezet"}</option>
        {isEsperes ? (
          <>
            {sajat.length > 0 && (
              <optgroup label="Saját gyülekezeteim">
                {sajat.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nev}
                  </option>
                ))}
              </optgroup>
            )}
            {tobbi.length > 0 && (
              <optgroup label="Egyházmegye többi gyülekezete (csak megtekintés)">
                {tobbi.map((g) => (
                  <option key={g.id} value={g.id} style={{ fontStyle: "italic" }}>
                    {g.nev}
                  </option>
                ))}
              </optgroup>
            )}
          </>
        ) : (
          gyulekezetek.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nev}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
