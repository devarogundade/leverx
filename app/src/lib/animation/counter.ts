export type CounterEasing = (progress: number) => number;

/** Smooth deceleration — default for numeric tickers. */
export function easeOutCubic(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - (1 - t) ** 3;
}

export function roundCounterValue(value: number, decimals?: number): number {
  if (decimals == null) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type AnimateCounterOptions = {
  from: number;
  to: number;
  duration?: number;
  easing?: CounterEasing;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
};

/**
 * Increment/decrement a number from `from` to `to` over `duration` ms.
 * Returns a cancel function for cleanup and rapid target changes.
 */
export function animateCounter({
  from,
  to,
  duration = 400,
  easing = easeOutCubic,
  onUpdate,
  onComplete,
}: AnimateCounterOptions): () => void {
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    onUpdate(to);
    onComplete?.();
    return () => {};
  }

  if (from === to || duration <= 0) {
    onUpdate(to);
    onComplete?.();
    return () => {};
  }

  const start = performance.now();
  let raf = 0;

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const value = from + (to - from) * easing(progress);
    onUpdate(value);

    if (progress < 1) {
      raf = requestAnimationFrame(tick);
      return;
    }

    onUpdate(to);
    onComplete?.();
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
