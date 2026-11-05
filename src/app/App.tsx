import { Route, Routes } from "react-router";
import { HomePage } from "./pages/HomePage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/preferences" element={<PreferencesPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
