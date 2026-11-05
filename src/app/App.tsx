export function App() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-lg flex-col items-center gap-6">
        <img
          src={`${import.meta.env.BASE_URL}brand/windwatcher-banner.png`}
          alt=""
          width={543}
          height={181}
          className="h-auto w-full"
        />
        <h1 className="sr-only">Windwatcher</h1>
      </div>
    </main>
  );
}
