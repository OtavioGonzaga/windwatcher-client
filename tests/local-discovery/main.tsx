// Isolated browser presentation fixture, not native interoperability evidence.
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { App } from "../../src/app/App";
import { Providers } from "../../src/app/Providers";
import { createI18n } from "../../src/shared/i18n";
import "../../src/app/styles.css";

createRoot(document.getElementById("root")!).render(
  <Providers i18n={createI18n("en")}>
    <HashRouter>
      <App />
    </HashRouter>
  </Providers>,
);
