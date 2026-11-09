import { Route, Routes } from "react-router";
import { HomePage } from "./pages/HomePage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AppShell } from "./AppShell";
import { AddServerPage } from "../features/server-discovery/AddServerPage";
import { AuthenticationPage } from "../features/authentication/AuthenticationPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="/connect" element={<AddServerPage />} />
        <Route path="/servers/:profileId/login" element={<AuthenticationPage />} />
        <Route path="/servers/:profileId/register" element={<AuthenticationPage registration />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
