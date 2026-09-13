import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { canEditGyulekezet, isAdmin, type Gyulekezet } from "../lib/types";

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
  if (gyulekezetek.length <= 1) return null;

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
