/**
 * Plausible ranges for monitor readings taken from a video. A value outside
 * them is treated as a misread and dropped, so a person fills it in instead.
 */
import type { RefVital } from './csv.ts';

export const READING_RANGES: Record<RefVital, readonly [number, number]> = {
  hr: [0, 300],
  sbp: [0, 300],
  dbp: [0, 250],
  spo2: [0, 100],
  rr: [0, 80],
  etco2: [0, 150],
};

/** The value when it is a finite number inside the vital's range, otherwise null. */
export function plausibleReading(vital: RefVital, x: unknown): number | null {
  const [lo, hi] = READING_RANGES[vital];
  return typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null;
}
