import { useEffect, useState } from "react";

/** Ticking clock for countdown UIs (default 1s). Returns 0 until mounted to match SSR. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
