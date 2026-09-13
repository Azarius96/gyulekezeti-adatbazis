import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { QuickPay } from "../components/QuickPay";
import { memberHighlight, canEditGyulekezet, type DuesResult } from "../lib/types";
import { age as calcAge } from "../lib/age";
import { useAuth } from "../context/AuthContext";

interface HouseholdMemberView {
  id: string;
  szerep: string;
  egyhazfenntarto: DuesResult;
  fizetveIdenre: boolean;
  tobbEveElmaradt: boolean;
  person: {
    id: string;
    vezeteknev: string;
    keresztnev: string;
    nem: "FERFI" | "NO";
    szuletesiDatum: string | null;
    elhunyt: boolean;
    vallas: string | null;
  };
}

interface HouseholdView {
  id: string;
  nev: string | null;
  gyulekezetId: string;
  vallasTipus: string;
  address: { telepules: string; utca: string; hazszam: string; emeletAjto: string | null };
  members: HouseholdMemberView[];
}

const szerepLabels: Record<string, string> = {
  CSALADFO: "családfő",
  HAZASTARS: "házastárs",
  GYERMEK: "gyermek",
  EGYEB: "egyéb",
};

/** A háztartáson belüli szerep (családfő/házastárs/gyermek/egyéb) a Person saját családi
 * állapotától (nőtlen/házas/özvegy/elvált) FÜGGETLEN mező - az egyik módosítása nem
 * frissíti automatikusan a másikat, ezért ez a kis szerkesztő közvetlenül itt teszi
 * lehetővé az utólagos javítást (pl. tömeges felvétel után, amikor a pontos rokoni
 * kapcsolat még nem volt ismert). */
function SzerepEditor({ memberId, szerep, onChanged }: { memberId: string; szerep: string; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true);
    try {
      await api.put(`/api/household-members/${memberId}`, { szerep: e.target.value });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select value={szerep} onChange={handleChange} disabled={saving} style={{ fontSize: "var(--font-size-sm)" }}>
      {Object.entries(szerepLabels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function HouseholdDetail() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [household, setHousehold] = useState<HouseholdView | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    api
      .get<HouseholdView>(`/api/households/${id}`)
      .then(setHousehold)
      .catch(() => setError("Nem sikerült betölteni a háztartás adatait"));
  }

  useEffect(load, [id]);

  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!household) return <p>Betöltés...</p>;

  const canEdit = canEditGyulekezet(user, household.gyulekezetId);

  return (
    <div className="stack">
      <Link to="/haztartasok">&larr; Vissza a háztartásokhoz</Link>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>
        {household.nev ?? `${household.address.telepules}, ${household.address.utca} ${household.address.hazszam}`}
      </h1>
      {household.nev && (
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          {household.address.telepules}, {household.address.utca} {household.address.hazszam}
          {household.address.emeletAjto ? `, ${household.address.emeletAjto}` : ""}
        </p>
      )}

      <div className="card" style={{ padding: 0 }}>
        {household.members.map((m) => {
          const age = calcAge(m.person.szuletesiDatum);
          const color = memberHighlight(m.egyhazfenntarto, m.tobbEveElmaradt);
          return (
            <div
              key={m.id}
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 24px",
                borderBottom: "1px solid var(--color-border)",
                background: color?.bg ?? "transparent",
              }}
            >
              <Link
                to={`/szemelyek/${m.person.id}`}
                style={{ textDecoration: "none", color: "var(--color-text)", flex: 1 }}
              >
                <span style={{ fontWeight: 600, color: color?.fg ?? "inherit" }}>
                  {m.person.vezeteknev} {m.person.keresztnev}
                  {m.fizetveIdenre && (
                    <span title="Idén már fizetett" style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                      {" "}
                      ✓
                    </span>
                  )}
                  {age !== null && <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> ({age} év)</span>}
                  {m.person.elhunyt && <span style={{ color: "var(--color-danger)" }}> (elhunyt)</span>}
                  {m.person.vallas && <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}> — {m.person.vallas}</span>}
                </span>{" "}
                <span style={{ color: "var(--color-text-muted)" }}>
                  {m.egyhazfenntarto.korsav &&
                    (m.egyhazfenntarto.mentes
                      ? " · mentes"
                      : m.egyhazfenntarto.kedvezmenyes
                        ? ` · kedvezményes: ${m.egyhazfenntarto.esedekesOsszeg} lej/év`
                        : ` · ${m.egyhazfenntarto.esedekesOsszeg} lej/év`)}
                </span>
                {m.tobbEveElmaradt && (
                  <span style={{ color: "var(--color-danger)", fontWeight: 700, fontSize: "var(--font-size-sm)" }}>
                    {" "}
                    · több éve elmaradt
                  </span>
                )}
              </Link>
              {canEdit ? (
                <SzerepEditor memberId={m.id} szerep={m.szerep} onChanged={load} />
              ) : (
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                  {szerepLabels[m.szerep] ?? m.szerep}
                </span>
              )}
              {!m.person.elhunyt && canEdit && (
                <QuickPay
                  personId={m.person.id}
                  defaultOsszeg={m.egyhazfenntarto.esedekesOsszeg}
                  fizetveIdenre={m.fizetveIdenre}
                />
              )}
              {!m.person.elhunyt && !canEdit && m.fizetveIdenre && (
                <span className="badge-sm" style={{ borderColor: "var(--color-primary)", color: "var(--color-primary-dark)" }}>
                  ✓ Befizetve
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
