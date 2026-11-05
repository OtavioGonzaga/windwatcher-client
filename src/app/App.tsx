import { useTranslation } from "react-i18next";
import { PresentationControls } from "../shared/components/PresentationControls";

export function App() {
  const { t } = useTranslation("foundation");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground sm:p-10">
      <div className="flex w-full max-w-lg flex-col items-center gap-8">
        <img
          src={`${import.meta.env.BASE_URL}brand/windwatcher-banner.png`}
          alt=""
          width={543}
          height={181}
          className="h-auto w-full rounded-md bg-brand-backdrop p-4"
        />
        <h1 className="sr-only">Windwatcher</h1>
        <p className="text-center text-base text-secondary">{t("description")}</p>
        <div className="w-full border-t border-border pt-6">
          <PresentationControls />
        </div>
      </div>
    </main>
  );
}
