const DAY_MS = 24 * 60 * 60 * 1000;

/** Downsample to at most `maxPoints` values, preserving endpoints. */
export function downsampleSeries(values: readonly number[], maxPoints = 32): number[] {
  if (values.length <= maxPoints) return [...values];
  if (maxPoints < 2) return [values[values.length - 1] ?? 0];

  const out: number[] = [];
  const lastIndex = values.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * lastIndex);
    out.push(values[idx]!);
  }
  return out;
}

export function changePercentOverWindow(
  values: readonly number[],
  timestamps: readonly number[],
  nowMs = Date.now(),
): number {
  if (values.length < 2 || timestamps.length !== values.length) return 0;

  const latest = values[values.length - 1] ?? 0;
  const cutoff = nowMs - DAY_MS;
  let ref = values[0] ?? latest;

  for (let i = 0; i < values.length; i++) {
    if ((timestamps[i] ?? 0) <= cutoff) {
      ref = values[i] ?? ref;
    }
  }

  if (ref <= 0) return 0;
  return ((latest - ref) / ref) * 100;
}

export function changePercentEndpoints(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (first <= 0) return 0;
  return ((last - first) / first) * 100;
}

/** Map a numeric series into SVG polyline points within a view box. */
export function seriesToPolylinePoints(
  values: readonly number[],
  viewWidth: number,
  viewHeight: number,
  padding = 1,
): string {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return "";

  const innerW = Math.max(1, viewWidth - padding * 2);
  const innerH = Math.max(1, viewHeight - padding * 2);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;

  if (finite.length === 1) {
    const y = padding + innerH / 2;
    return `${padding},${y} ${padding + innerW},${y}`;
  }

  return finite
    .map((value, index) => {
      const x = padding + (index / (finite.length - 1)) * innerW;
      const y = padding + innerH - ((value - min) / range) * innerH;
      return `${x},${y}`;
    })
    .join(" ");
}
