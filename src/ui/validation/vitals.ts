import type { RefVital } from '../../engine/validation/csv.ts';

export interface VitalInfo {
  title: string;
  unit: string;
  /** Default axis range; widened to fit the data. */
  lo: number;
  hi: number;
}

export const VITAL_INFO: Record<RefVital, VitalInfo> = {
  hr: { title: 'Heart rate', unit: '/min', lo: 50, hi: 150 },
  sbp: { title: 'Systolic BP', unit: 'mmHg', lo: 60, hi: 160 },
  dbp: { title: 'Diastolic BP', unit: 'mmHg', lo: 30, hi: 100 },
  spo2: { title: 'SpO₂', unit: '%', lo: 85, hi: 100 },
  rr: { title: 'Respiratory rate', unit: '/min', lo: 5, hi: 35 },
  etco2: { title: 'EtCO₂', unit: 'mmHg', lo: 20, hi: 50 },
};

/** Round axis ticks (1, 2 or 5 × a power of ten) covering lo..hi. */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const mult = [1, 2, 5, 10].find((m) => span / (step * m) <= n) ?? 10;
  const s = step * mult;
  const out: number[] = [];
  for (let v = Math.floor(lo / s) * s; v < hi + s - 1e-9; v += s) out.push(Number(v.toFixed(6)));
  return out;
}

/** Time ticks every 1, 2, 5 or 10 minutes, about six across. */
export function timeTicks(maxT: number): number[] {
  const step = [60, 120, 300, 600].find((s) => maxT / s <= 8) ?? 900;
  const out: number[] = [];
  for (let t = 0; t <= maxT; t += step) out.push(t);
  return out;
}

export const fmtNum = (n: number | null | undefined, dp = 1): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '–' : n.toFixed(dp);

/** m:ss for reference times. */
export function fmtT(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '–';
  const s = Math.round(sec);
  const sign = s < 0 ? '−' : '';
  const a = Math.abs(s);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** Signed seconds, e.g. "+83 s" or "−12 s". */
export function fmtLag(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '–';
  const s = Math.round(sec);
  return `${s > 0 ? '+' : s < 0 ? '−' : ''}${Math.abs(s)} s`;
}
