import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../context/AuthContext";
import { IconChurch } from "../components/icons";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bejelentkezés sikertelen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-3)",
      }}
    >
      <form onSubmit={handleSubmit} className="card" style={{ width: "min(440px, 92vw)", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: "var(--space-2)" }}>
          <div className="icon-tile icon-tile--blue" style={{ width: 60, height: 60, borderRadius: 18, boxShadow: "var(--shadow-md)" }}>
            <IconChurch style={{ width: 32, height: 32 }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0 }}>Gyülekezeti adatbázis</h1>
            <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0" }}>Kérjük, jelentkezzen be</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">E-mail cím</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Jelszó</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" style={{ color: "var(--color-danger)", fontWeight: 600, background: "var(--color-danger-light)", padding: "10px 14px", borderRadius: "var(--radius-sm)" }}>
            {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Bejelentkezés..." : "Bejelentkezés"}
        </button>
      </form>
    </div>
  );
}
