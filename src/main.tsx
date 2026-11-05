import { StrictMode } from "react";
import { HashRouter } from "react-router";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Providers } from "./app/Providers";
import { createI18n } from "./shared/i18n";
import { initializeTheme } from "./shared/design-system/theme";
import "./app/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root element is missing.");
initializeTheme();
const i18n = createI18n();

createRoot(root).render(
  <StrictMode>
    <Providers i18n={i18n}>
      <HashRouter>
        <App />
      </HashRouter>
    </Providers>
  </StrictMode>,
);
