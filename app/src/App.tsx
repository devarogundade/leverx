import { APP_NAME, APP_TAGLINE } from "./lib/brand";

export function App() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex items-end justify-center gap-1 rounded-md bg-accent/20 p-2">
        <span className="h-8 w-1 rounded-sm bg-accent" />
        <span className="h-6 w-1 rounded-sm bg-accent" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{APP_NAME}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{APP_TAGLINE}</p>
      <p className="mt-8 text-sm text-muted-foreground">Fresh scaffold — ready to build.</p>
    </div>
  );
}
