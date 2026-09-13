import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { PersonDetail } from "./pages/PersonDetail";
import { Households } from "./pages/Households";
import { HouseholdDetail } from "./pages/HouseholdDetail";
import { Import } from "./pages/Import";
import { Users } from "./pages/Users";
import { Gyulekezetek } from "./pages/Gyulekezetek";
import { GyulekezetEdit } from "./pages/GyulekezetEdit";
import { GyulekezetSetup } from "./pages/GyulekezetSetup";
import { Szervezet } from "./pages/Szervezet";
import { Penzugyek } from "./pages/Penzugyek";
import { Temeto } from "./pages/Temeto";
import { Anyakonyvek } from "./pages/Anyakonyvek";
import { Backups } from "./pages/Backups";
import { Teendok } from "./pages/Teendok";
import { ValasztokNevjegyzeke } from "./pages/ValasztokNevjegyzeke";
import { LelekszamJelentes } from "./pages/LelekszamJelentes";
import { Dokumentumok } from "./pages/Dokumentumok";
import { SzemelyiAdatlap } from "./pages/SzemelyiAdatlap";
import { HivatalosIgazolasok } from "./pages/HivatalosIgazolasok";
import { ValtozasTortenet } from "./pages/ValtozasTortenet";
import { Papirkosar } from "./pages/Papirkosar";
import { pendingLelkeszRole } from "./lib/types";

function PrivateArea() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p style={{ padding: 40 }}>Betöltés...</p>;
  if (!user) return <Navigate to="/bejelentkezes" replace />;
  if (pendingLelkeszRole(user) && location.pathname !== "/gyulekezet-setup") {
    return <Navigate to="/gyulekezet-setup" replace />;
  }
  return <Layout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/bejelentkezes" element={<Login />} />
      <Route path="/" element={<PrivateArea />}>
        <Route index element={<Dashboard />} />
        <Route path="szemelyek/:id" element={<PersonDetail />} />
        <Route path="szemelyek/:id/adatlap" element={<SzemelyiAdatlap />} />
        <Route path="szemelyek/:id/igazolas" element={<HivatalosIgazolasok />} />
        <Route path="haztartasok" element={<Households />} />
        <Route path="haztartasok/:id" element={<HouseholdDetail />} />
        <Route path="import" element={<Import />} />
        <Route path="felhasznalok" element={<Users />} />
        <Route path="gyulekezetek" element={<Gyulekezetek />} />
        <Route path="gyulekezetek/:id" element={<GyulekezetEdit />} />
        <Route path="gyulekezet-setup" element={<GyulekezetSetup />} />
        <Route path="szervezet" element={<Szervezet />} />
        <Route path="penzugyek" element={<Penzugyek />} />
        <Route path="temeto" element={<Temeto />} />
        <Route path="anyakonyvek" element={<Anyakonyvek />} />
        <Route path="mentesek" element={<Backups />} />
        <Route path="teendok" element={<Teendok />} />
        <Route path="valasztoi-nevjegyzek" element={<ValasztokNevjegyzeke />} />
        <Route path="lelekszam-jelentes" element={<LelekszamJelentes />} />
        <Route path="dokumentumok" element={<Dokumentumok />} />
        <Route path="valtozas-tortenet" element={<ValtozasTortenet />} />
        <Route path="papirkosar" element={<Papirkosar />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
