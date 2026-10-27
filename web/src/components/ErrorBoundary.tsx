import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface Props {
  children: ReactNode;
  /** Az útvonal változásakor a hibaállapot törlődik (egy másik oldalra lépve újra próbálkozik). */
  resetKey: string;
}
interface State {
  error: Error | null;
  resetKey: string;
}

/**
 * Hibahatár az oldaltartalom körül: ha egy oldal betöltése (pl. egy deploy után már nem létező kódcsomag miatt,
 * iPaden a régi, gyorsítótárazott verzióból) vagy megjelenítése hibára fut, nem marad üres a képernyő, hanem
 * érthető üzenet és "Oldal újratöltése" gomb jelenik meg. Az adatok ilyenkor nem sérülnek - azok a szerveren vannak.
 */
class Boundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" style={{ gap: 10 }}>
        <strong>Az oldal tartalmát most nem sikerült megjeleníteni.</strong>
        <span style={{ color: "var(--color-text-muted)" }}>
          Valószínűleg az alkalmazás frissült, és a böngésző még a régi verziót használja. Az adataid nem vesztek el, a
          szerveren érintetlenül megvannak.
        </span>
        <div>
          <button className="btn" onClick={() => window.location.reload()}>
            Oldal újratöltése
          </button>
        </div>
      </div>
    );
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <Boundary resetKey={location.pathname}>{children}</Boundary>;
}
