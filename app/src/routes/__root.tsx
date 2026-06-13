import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import "@/lib/chunk-reload";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "../lib/brand";
import { IndexerStreamProvider } from "../context/IndexerStreamContext";
import { MarketFavoritesProvider } from "../context/MarketFavoritesContext";
import { PredictOracleProvider } from "../context/PredictOracleContext";
import { Toaster } from "@/components/ui/sonner";
import { WalletProvider } from "../context/WalletContext";
import { ensurePredictOracles } from "@/lib/router/route-loaders";
import { routePendingOptions } from "@/lib/router/route-options";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/markets">Go to markets</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void; }) {
  if (import.meta.env.DEV) {
    console.error("[LeverX]", error);
  }
  const router = useRouter();

  const devMessage =
    import.meta.env.DEV && error?.message ? error.message : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {devMessage ? (
          <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-left text-sm text-destructive">
            {devMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline">
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('lx-theme');if(t!=='light'&&t!=='dark'){t='dark';}var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t);}catch(e){document.documentElement.classList.add('dark');}})();`;

const CHUNK_RELOAD_SCRIPT = `(function(){var k='lx-chunk-reload';function r(){if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');var u=new URL(location.href);u.searchParams.set('_lx',Date.now());location.replace(u.toString());}function ok(m){m=(m||'').toLowerCase();return m.indexOf('mime type')>-1||m.indexOf('failed to load module script')>-1||m.indexOf('dynamically imported module')>-1||m.indexOf('chunkloaderror')>-1;}window.addEventListener('vite:preloadError',r);window.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT'&&t.src&&(t.src.indexOf('/assets/')>-1||/\\.m?js(?:[?#]|$)/.test(t.src)))r();else if(ok(e.message)||ok(e.filename))r();},true);window.addEventListener('unhandledrejection',function(e){var m=e.reason&&e.reason.message?e.reason.message:typeof e.reason==='string'?e.reason:'';if(ok(m))r();});window.addEventListener('load',function(){sessionStorage.removeItem(k);});})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient; }>()({
  ...routePendingOptions,
  loader: ({ context }) => ensurePredictOracles(context.queryClient),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Trade price predictions with dUSDC margin at up to 10× leverage on the LeverX demo.",
      },
      { property: "og:title", content: APP_NAME },
      {
        property: "og:description",
        content: "Trade price predictions with dUSDC margin at up to 10× leverage on the LeverX demo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [{ children: THEME_INIT_SCRIPT }, { children: CHUNK_RELOAD_SCRIPT }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode; }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className="min-h-dvh bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <PredictOracleProvider>
        <IndexerStreamProvider>
          <MarketFavoritesProvider>
            <WalletProvider>
              <div className="app-outlet flex min-h-dvh flex-col">
                {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
                <Outlet />
              </div>
              <Toaster position="bottom-right" richColors closeButton />
            </WalletProvider>
          </MarketFavoritesProvider>
        </IndexerStreamProvider>
      </PredictOracleProvider>
    </QueryClientProvider>
  );
}
