import { useEffect, useState } from "react";
import { PageLoader } from "../components/Loading";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { QuickPay } from "../components/QuickPay";
import { useReloadOnPayment } from "../context/PaymentSessionContext";
import { memberHighlight, reszfizetesSzoveg, szerepNev, canEditGyulekezet, tartozasSzoveg, type TartozasEv, type DuesResult } from "../lib/types";
import { age as calcAge } from "../lib/age";
import { useAuth } from "../context/AuthContext";

interface HouseholdMemberView {
  id: string;
  szerep: string;
  egyhazfenntarto: DuesResult;
  fizetveIdenre: boolean;
  idenFizetett: number;
  reszbenFizetett: boolean;
  idenHianyzo: number;
  egyhazfenntartoBecsult: boolean;
  tobbEveElmaradt: boolean;
  tartozasOsszeg: number;
  tartozasEvek: TartozasEv[];
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

/** A háztartáson belüli szerep (apa-anya/gyerek/egyéb) a Person saját családi
 * állapotától (nőtlen/házas/özvegy/elvált) FÜGGETLEN mező - az egyik módosítása nem
 * frissíti automatikusan a másikat, ezért ez a kis szerkesztő közvetlenül itt teszi
 * lehetővé az utólagos javítást (pl. tömeges felvétel után, amikor a pontos rokoni
 * kapcsolat még nem volt ismert). */
function SzerepEditor({
  memberId,
  szerep,
  nem,
  vanMasCsaladfo,
  onChanged,
}: {
  memberId: string;
  szerep: string;
  nem: "FERFI" | "NO";
  /** Igaz, ha a háztartásban egy másik tag már "családfő" - ilyenkor az újonnan szülőnek jelölt a "házastárs" szerepet kapja. */
  vanMasCsaladfo: boolean;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const szuloE = szerep === "CSALADFO" || szerep === "HAZASTARS";

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const ujSzerep = v === "SZULO" ? (vanMasCsaladfo ? "HAZASTARS" : "CSALADFO") : v;
    setSaving(true);
    try {
      await api.put(`/api/household-members/${memberId}`, { szerep: ujSzerep });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select value={szuloE ? "SZULO" : szerep} onChange={handleChange} disabled={saving} style={{ fontSize: "var(--font-size-sm)" }}>
      <option value="SZULO">{szerepNev("CSALADFO", nem)}</option>
      <option value="GYERMEK">{szerepNev("GYERMEK")}</option>
      <option value="EGYEB">{szerepNev("EGYEB")}</option>
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
  useReloadOnPayment(load);

  if (error) return <p style={{ color: "var(--color-danger)" }}>{error}</p>;
  if (!household) return <PageLoader />;

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
          const color = memberHighlight(m.egyhazfenntarto, m.tobbEveElmaradt, m.reszbenFizetett);
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
                  {m.egyhazfenntarto.korsav === null && m.egyhazfenntartoBecsult && m.egyhazfenntarto.esedekesOsszeg
                    ? ` · ${m.egyhazfenntarto.esedekesOsszeg} lej/év (általános díj)`
                    : m.egyhazfenntarto.korsav &&
                    (m.egyhazfenntarto.mentes
                      ? " · mentes"
                      : m.egyhazfenntarto.kedvezmenyes
                        ? ` · kedvezményes: ${m.egyhazfenntarto.esedekesOsszeg} lej/év`
                        : ` · ${m.egyhazfenntarto.esedekesOsszeg} lej/év`)}
                </span>
                {m.tobbEveElmaradt && (
                  <span style={{ color: "var(--color-danger)", fontWeight: 700, fontSize: "var(--font-size-sm)" }}>
                    {" "}
                    · tartozás: {tartozasSzoveg(m.tartozasOsszeg, m.tartozasEvek)}
                  </span>
                )}
                {m.reszbenFizetett && (
                  <span style={{ color: "#ffb340", fontWeight: 700, fontSize: "var(--font-size-sm)" }}>
                    {" "}
                    · {reszfizetesSzoveg(m.idenFizetett, m.egyhazfenntarto.esedekesOsszeg, m.idenHianyzo)}
                  </span>
                )}
              </Link>
              {canEdit ? (
                <SzerepEditor
                  memberId={m.id}
                  szerep={m.szerep}
                  nem={m.person.nem}
                  vanMasCsaladfo={household.members.some((x) => x.id !== m.id && x.szerep === "CSALADFO")}
                  onChanged={load}
                />
              ) : (
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                  {szerepNev(m.szerep, m.person.nem)}
                </span>
              )}
              {!m.person.elhunyt && canEdit && (
                <QuickPay
                  personId={m.person.id}
                  nev={`${m.person.vezeteknev} ${m.person.keresztnev}`}
                  defaultOsszeg={m.reszbenFizetett ? m.idenHianyzo : m.egyhazfenntarto.esedekesOsszeg}
                  fizetveIdenre={m.fizetveIdenre}
                  reszbenFizetett={m.reszbenFizetett}
                />
              )}
              {!m.person.elhunyt && !canEdit && m.fizetveIdenre && (
                <span className="badge-sm" style={{ borderColor: "var(--color-primary)", color: "var(--color-primary-dark)" }}>
                  ✓ Befizetve
                </span>
              )}
              {!m.person.elhunyt && !canEdit && m.reszbenFizetett && (
                <span className="badge-sm" style={{ borderColor: "#ffb340", color: "#ffb340" }}>
                  Részben fizetve
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
