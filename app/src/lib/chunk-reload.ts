const RELOAD_KEY = "lx-chunk-reload";

function shouldReloadForChunkError(message: string): boolean {
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module")
  );
}

function reloadOnceForStaleChunks(): void {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(RELOAD_KEY)) return;

  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    reloadOnceForStaleChunks();
  });

  window.addEventListener("error", (event) => {
    if (shouldReloadForChunkError(event.message ?? "")) {
      reloadOnceForStaleChunks();
    }
  });

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
