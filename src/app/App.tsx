import { Route, Routes } from "react-router";
import { HomePage } from "./pages/HomePage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AppShell } from "./AppShell";
import { AddServerPage } from "../features/server-discovery/AddServerPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="/connect" element={<AddServerPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
