import { useTranslation } from "react-i18next";

export function HomePage() {
  const { t: foundation } = useTranslation("foundation");
  return (
    <div className="flex min-w-0 max-w-lg flex-col gap-8">
      <img
        src={`${import.meta.env.BASE_URL}brand/windwatcher-banner.png`}
        alt=""
        width={543}
        height={181}
        className="h-auto w-full rounded-md bg-brand-backdrop p-4"
      />
      <h1 className="text-lg font-semibold">Windwatcher</h1>
      <p className="text-secondary">{foundation("description")}</p>
    </div>
  );
}
