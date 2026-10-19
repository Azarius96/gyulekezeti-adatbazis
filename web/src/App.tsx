import { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { GyulekezetProvider } from "./context/GyulekezetContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const PersonDetail = lazy(() => import("./pages/PersonDetail").then((m) => ({ default: m.PersonDetail })));
const Households = lazy(() => import("./pages/Households").then((m) => ({ default: m.Households })));
const HouseholdDetail = lazy(() => import("./pages/HouseholdDetail").then((m) => ({ default: m.HouseholdDetail })));
const Import = lazy(() => import("./pages/Import").then((m) => ({ default: m.Import })));
const Users = lazy(() => import("./pages/Users").then((m) => ({ default: m.Users })));
const Gyulekezetek = lazy(() => import("./pages/Gyulekezetek").then((m) => ({ default: m.Gyulekezetek })));
const GyulekezetEdit = lazy(() => import("./pages/GyulekezetEdit").then((m) => ({ default: m.GyulekezetEdit })));
const GyulekezetSetup = lazy(() => import("./pages/GyulekezetSetup").then((m) => ({ default: m.GyulekezetSetup })));
const Szervezet = lazy(() => import("./pages/Szervezet").then((m) => ({ default: m.Szervezet })));
const Penzugyek = lazy(() => import("./pages/Penzugyek").then((m) => ({ default: m.Penzugyek })));
const Temeto = lazy(() => import("./pages/Temeto").then((m) => ({ default: m.Temeto })));
const Anyakonyvek = lazy(() => import("./pages/Anyakonyvek").then((m) => ({ default: m.Anyakonyvek })));
const Backups = lazy(() => import("./pages/Backups").then((m) => ({ default: m.Backups })));
const Teendok = lazy(() => import("./pages/Teendok").then((m) => ({ default: m.Teendok })));
const ValasztokNevjegyzeke = lazy(() => import("./pages/ValasztokNevjegyzeke").then((m) => ({ default: m.ValasztokNevjegyzeke })));
const LelekszamJelentes = lazy(() => import("./pages/LelekszamJelentes").then((m) => ({ default: m.LelekszamJelentes })));
const Dokumentumok = lazy(() => import("./pages/Dokumentumok").then((m) => ({ default: m.Dokumentumok })));
const SzemelyiAdatlap = lazy(() => import("./pages/SzemelyiAdatlap").then((m) => ({ default: m.SzemelyiAdatlap })));
const HivatalosIgazolasok = lazy(() => import("./pages/HivatalosIgazolasok").then((m) => ({ default: m.HivatalosIgazolasok })));
const ValtozasTortenet = lazy(() => import("./pages/ValtozasTortenet").then((m) => ({ default: m.ValtozasTortenet })));
const Papirkosar = lazy(() => import("./pages/Papirkosar").then((m) => ({ default: m.Papirkosar })));
const Tovabbkepzesek = lazy(() => import("./pages/Tovabbkepzesek").then((m) => ({ default: m.Tovabbkepzesek })));
import { pendingLelkeszRole, isStatsOnly } from "./lib/types";

function PrivateArea() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p style={{ padding: 40 }}>Betöltés...</p>;
  if (!user) return <Navigate to="/bejelentkezes" replace />;
  if (pendingLelkeszRole(user) && location.pathname !== "/gyulekezet-setup") {
    return <Navigate to="/gyulekezet-setup" replace />;
  }
  // Püspöki (csak statisztika) fiók: az áttekintőn és a gyülekezetek statisztikáján kívül nincs más oldala.
  if (isStatsOnly(user) && !["/", "/gyulekezetek", "/lelekszam-jelentes"].includes(location.pathname)) {
    return <Navigate to="/" replace />;
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
        <Route path="tovabbkepzesek" element={<Tovabbkepzesek />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GyulekezetProvider>
        <AppRoutes />
      </GyulekezetProvider>
    </AuthProvider>
  );
}
