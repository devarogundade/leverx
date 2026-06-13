const RELOAD_KEY = "lx-chunk-reload";

function shouldReloadForChunkError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("importing a module script failed") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("failed to load module script") ||
    text.includes("mime type") ||
    text.includes("loading chunk") ||
    text.includes("chunkloaderror")
  );
}

function isHashedAssetUrl(src: string): boolean {
  return src.includes("/assets/") || /\/[\w-]+-[A-Za-z0-9_-]+\.m?js(?:[?#]|$)/.test(src);
}

function isStaleAssetScript(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof HTMLScriptElement)) return false;
  const src = target.src;
  if (!src) return false;
  return isHashedAssetUrl(src) && (target.type === "module" || /\.m?js(?:[?#]|$)/.test(src));
}

function reloadOnceForStaleChunks(): void {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(RELOAD_KEY)) return;

  sessionStorage.setItem(RELOAD_KEY, "1");
  const url = new URL(window.location.href);
  url.searchParams.set("_lx", String(Date.now()));
  window.location.replace(url.toString());
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    reloadOnceForStaleChunks();
  });

  window.addEventListener(
    "error",
    (event) => {
      const message = event.message ?? "";
      const filename =
        event instanceof ErrorEvent && event.filename ? event.filename : "";
      if (
        isStaleAssetScript(event) ||
        shouldReloadForChunkError(message) ||
        shouldReloadForChunkError(filename)
      ) {
        reloadOnceForStaleChunks();
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
    if (shouldReloadForChunkError(message)) {
      reloadOnceForStaleChunks();
    }
  });

  window.addEventListener("load", () => {
    sessionStorage.removeItem(RELOAD_KEY);
  });
}
