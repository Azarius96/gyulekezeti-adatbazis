import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface HianyzoEv {
  ev: number;
  esedekesOsszeg: number;
  fizetve: number;
  hianyzo: number;
}

/**
 * Gyors befizetés-rögzítő - egyházfenntartónál nem csak a folyó évre enged fizetni, hanem
 * lekérdezi, mely korábbi évekre (is) tartozik még a személy, és azt ajánlja fel elsőként
 * (a legkorábbi hiányzó évet, a helyes - akkor érvényes - összeggel előtöltve). Enélkül a
 * mező mindig a folyó évre és annak díjára ugrott vissza, így egy több éve elmaradt tag
 * régebbi éveit gyakorlatilag lehetetlen volt korrekt összeggel rögzíteni.
 */
export function QuickPay({
  personId,
  defaultOsszeg,
  fizetveIdenre,
}: {
  personId: string;
  defaultOsszeg: number | null;
  fizetveIdenre: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"dues" | "donation">("dues");
  const [hianyzoEvek, setHianyzoEvek] = useState<HianyzoEv[] | null>(null);
  const [ev, setEv] = useState(String(new Date().getFullYear()));
  const [customEv, setCustomEv] = useState(false);
  const [osszeg, setOsszeg] = useState(defaultOsszeg !== null ? String(defaultOsszeg) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || kind !== "dues" || hianyzoEvek !== null) return;
    api
      .get<{ evek: HianyzoEv[] }>(`/api/persons/${personId}/hianyzo-evek`)
      .then((res) => {
        setHianyzoEvek(res.evek);
        if (res.evek.length > 0) {
          setEv(String(res.evek[0].ev));
          setOsszeg(String(res.evek[0].hianyzo));
        }
      })
      .catch(() => setHianyzoEvek([]));
  }, [open, kind, hianyzoEvek, personId]);

  function handleYearSelect(value: string) {
    if (value === "egyeb") {
      setCustomEv(true);
      return;
    }
    setCustomEv(false);
    setEv(value);
    const match = hianyzoEvek?.find((e) => String(e.ev) === value);
    if (match) setOsszeg(String(match.hianyzo));
  }

  async function handleSave() {
    if (!osszeg) return;
    setSaving(true);
    try {
      await api.post(kind === "dues" ? "/api/dues-payments" : "/api/donations", {
        personId,
        ev: Number(ev),
        osszeg: Number(osszeg),
      });
      setOsszeg("");
      setHianyzoEvek(null);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, 700);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        className={fizetveIdenre ? "btn btn-sm" : "btn btn-secondary btn-sm"}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {fizetveIdenre ? "✓ Befizetve" : "Befizetés"}
      </button>
    );
  }

  const showYearSelect = kind === "dues" && !customEv && hianyzoEvek !== null && hianyzoEvek.length > 0;

  return (
    <span className="row" style={{ alignItems: "center" }} onClick={(e) => e.preventDefault()}>
      <select
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as "dues" | "donation");
          setCustomEv(false);
        }}
      >
        <option value="dues">Egyházfenntartó</option>
        <option value="donation">Adomány</option>
      </select>
      {showYearSelect ? (
        <select value={ev} onChange={(e) => handleYearSelect(e.target.value)} style={{ minWidth: 190 }}>
          {hianyzoEvek!.map((e) => (
            <option key={e.ev} value={e.ev}>
              {e.ev} — {e.hianyzo} lej hiányzik
            </option>
          ))}
          <option value="egyeb">Egyéb év...</option>
        </select>
      ) : (
        <input type="number" placeholder="Év" style={{ width: 95 }} value={ev} onChange={(e) => setEv(e.target.value)} />
      )}
      <input type="number" placeholder="Összeg" style={{ width: 115 }} value={osszeg} onChange={(e) => setOsszeg(e.target.value)} />
      <button className="btn btn-secondary btn-sm" disabled={saving} onClick={handleSave}>
        {saved ? "Mentve ✓" : "Mentés"}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
        Mégse
      </button>
    </span>
  );
}
