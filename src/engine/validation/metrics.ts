/**
 * Agreement between a simulated and a reference vital-sign series, sampled at
 * the reference time points: RMSE, mean absolute error, bias, maximum
 * deviation, share within tolerance, and the stretches that exceed it.
 */

export interface Pair {
  /** Reference time (s). */
  t: number;
  ref: number;
  sim: number;
}

export interface SeriesMetrics {
  n: number;
  rmse: number | null;
  mae: number | null;
  /** Mean of sim − ref: positive when the sim reads high. */
  bias: number | null;
  /** Largest |sim − ref|, and when it happened. */
  maxDev: number | null;
  maxDevT: number | null;
  /** Share of points with |sim − ref| ≤ tolerance (0–1). */
  withinTol: number | null;
  tolerance: number;
  /** True when any point is beyond tolerance. */
  flagged: boolean;
}

export function seriesMetrics(pairs: readonly Pair[], tolerance: number): SeriesMetrics {
  const n = pairs.length;
  if (!n) {
    return {
      n,
      rmse: null,
      mae: null,
      bias: null,
      maxDev: null,
      maxDevT: null,
      withinTol: null,
      tolerance,
      flagged: false,
    };
  }
  let sq = 0;
  let abs = 0;
  let sum = 0;
  let within = 0;
  let maxDev = -1;
  let maxDevT = 0;
  for (const p of pairs) {
    const d = p.sim - p.ref;
    sq += d * d;
    abs += Math.abs(d);
    sum += d;
    if (Math.abs(d) <= tolerance) within += 1;
    if (Math.abs(d) > maxDev) {
      maxDev = Math.abs(d);
      maxDevT = p.t;
    }
  }
  return {
    n,
    rmse: Math.sqrt(sq / n),
    mae: abs / n,
    bias: sum / n,
    maxDev,
    maxDevT,
    withinTol: within / n,
    tolerance,
    flagged: within < n,
  };
}

export interface Divergence {
  /** Reference time of the first and last point beyond tolerance. */
  from: number;
  to: number;
  peakDev: number;
  peakT: number;
  /** True when the sim reads higher than the reference at the peak. */
  simHigher: boolean;
}

/** Consecutive reference points beyond tolerance, grouped into stretches. */
export function divergences(pairs: readonly Pair[], tolerance: number): Divergence[] {
  const out: Divergence[] = [];
  let cur: Divergence | null = null;
  for (const p of pairs) {
    const d = p.sim - p.ref;
    if (Math.abs(d) > tolerance) {
      if (!cur) {
        cur = { from: p.t, to: p.t, peakDev: Math.abs(d), peakT: p.t, simHigher: d > 0 };
        out.push(cur);
      }
      cur.to = p.t;
      if (Math.abs(d) > cur.peakDev) {
        cur.peakDev = Math.abs(d);
        cur.peakT = p.t;
        cur.simHigher = d > 0;
      }
    } else cur = null;
  }
  return out;
}

export interface Point {
  t: number;
  v: number | null;
}

/**
 * First time at or after fromT when the series is above (or below) the
 * threshold, interpolating linearly between samples. Null if it never is.
 */
export function crossingTime(
  series: readonly Point[],
  fromT: number,
  direction: 'above' | 'below',
  threshold: number,
): number | null {
  const ok = (v: number) => (direction === 'above' ? v > threshold : v < threshold);
  let prev: { t: number; v: number } | null = null;
  for (const p of series) {
    if (p.v === null) continue;
    if (p.t < fromT) {
      prev = { t: p.t, v: p.v };
      continue;
    }
    if (ok(p.v)) {
      // Already past the threshold before fromT: it counts from fromT.
      if (prev && ok(prev.v)) return fromT;
      if (!prev) return p.t;
      // prev is on the other side, so the values differ: interpolate.
      const t = prev.t + ((threshold - prev.v) / (p.v - prev.v)) * (p.t - prev.t);
      return Math.max(fromT, t);
    }
    prev = { t: p.t, v: p.v };
  }
  return null;
}
