/**
 * NEWS2 (Royal College of Physicians, 2017) from a set of observations, for
 * the triage board. The thresholds live in src/content/news2.json with their
 * source; this file only applies them.
 */
import NEWS2 from '../content/news2.json';

export interface Obs {
  rr: number | null;
  spo2: number | null;
  sbp: number | null;
  hr: number | null;
  temp: number | null;
  gcs: number;
  onOxygen: boolean;
}

export type Risk = 'low' | 'medium' | 'high';

export interface News2Result {
  score: number;
  risk: Risk;
  label: string;
  response: string;
  /** A single parameter scoring 3 (the "low–medium" trigger). */
  singleRed: boolean;
  /** Parameters that couldn't be measured, so the score may be an underestimate. */
  missing: string[];
}

type Band = { max?: number; score: number };
const PARAMS = NEWS2.parameters as Record<'rr' | 'spo2' | 'sbp' | 'hr' | 'temp', Band[]>;

function bandScore(bands: Band[], value: number): number {
  for (const b of bands) if (b.max === undefined || value <= b.max) return b.score;
  return 0;
}

/** Observations are charted as whole numbers (temperature to 0.1 °C) before scoring. */
const charted = (key: keyof typeof PARAMS, v: number) =>
  key === 'temp' ? Math.round(v * 10) / 10 : Math.round(v);

export function news2(obs: Obs, age: number): News2Result | null {
  if (age < NEWS2.minAge) return null;
  let score = 0;
  let singleRed = false;
  const missing: string[] = [];
  for (const key of Object.keys(PARAMS) as (keyof typeof PARAMS)[]) {
    const v = obs[key];
    if (v === null || !Number.isFinite(v)) {
      missing.push(key);
      continue;
    }
    const s = bandScore(PARAMS[key], charted(key, v));
    score += s;
    if (s === 3) singleRed = true;
  }
  if (obs.gcs < 15) {
    score += NEWS2.consciousness.score;
    singleRed = true;
  }
  if (obs.onOxygen) score += NEWS2.oxygenScore;
  const band = NEWS2.bands.find((b) => score >= b.min) ?? NEWS2.bands[NEWS2.bands.length - 1];
  return {
    score,
    risk: (band?.risk ?? 'low') as Risk,
    label: band?.label ?? 'Low',
    response: band?.response ?? '',
    singleRed,
    missing,
  };
}

export const NEWS2_SOURCE = NEWS2.source;
