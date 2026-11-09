/**
 * Monitor alarm limits and evaluation. Pure functions so they can be tested.
 * High priority = immediate danger (red); medium = needs attention (yellow).
 */
import type { NibpReading } from '../../app/session.ts';
import type { Rhythm, Vitals } from '../../engine/types.ts';

export type AlarmKey = 'hr' | 'spo2' | 'bp' | 'rr' | 'etco2' | 'temp' | 'rhythm';
export type Priority = 'high' | 'medium';

export interface Limit {
  key: Exclude<AlarmKey, 'rhythm' | 'bp'> | 'sbp';
  label: string;
  low: number;
  high: number;
  critLow: number;
  critHigh: number;
}

/** Typical adult default limits on bedside monitors (configurable per case later). */
export const DEFAULT_LIMITS: readonly Limit[] = [
  { key: 'hr', label: 'HR', low: 50, high: 120, critLow: 40, critHigh: 150 },
  { key: 'spo2', label: 'SpO₂', low: 92, high: 101, critLow: 85, critHigh: 101 },
  { key: 'sbp', label: 'SBP', low: 90, high: 180, critLow: 70, critHigh: 220 },
  { key: 'rr', label: 'RR', low: 8, high: 25, critLow: 6, critHigh: 35 },
  { key: 'etco2', label: 'EtCO₂', low: 20, high: 50, critLow: 10, critHigh: 70 },
  { key: 'temp', label: 'Temp', low: 35, high: 38.5, critLow: 33, critHigh: 40 },
];

export interface ActiveAlarm {
  key: AlarmKey;
  priority: Priority;
  message: string;
}

const RHYTHM_ALARM: Partial<Record<Rhythm, string>> = {
  vf: 'VFIB',
  pvt: 'VTACH',
  vt: 'VTACH',
  asystole: 'ASYSTOLE',
};

export interface AlarmInput {
  vitals: Vitals;
  nibp: NibpReading | null;
  artLine: boolean;
  limits?: readonly Limit[];
}

export function evaluateAlarms({ vitals, nibp, artLine, limits = DEFAULT_LIMITS }: AlarmInput) {
  const out: ActiveAlarm[] = [];
  const rhythmMsg = RHYTHM_ALARM[vitals.rhythm];
  if (rhythmMsg) out.push({ key: 'rhythm', priority: 'high', message: rhythmMsg });
  else if (vitals.spo2 === null) {
    out.push({ key: 'spo2', priority: 'high', message: 'SpO₂ NO PULSE' });
  }
  const sbp = artLine ? vitals.sbp : (nibp?.sbp ?? null);
  const values: Record<Limit['key'], number | null> = {
    hr: vitals.hr,
    spo2: vitals.spo2,
    sbp,
    rr: vitals.rr,
    etco2: vitals.etco2,
    temp: vitals.temp,
  };
  for (const l of limits) {
    const v = values[l.key];
    if (v === null || Number.isNaN(v)) continue;
    // Arrest rhythms already alarm; don't pile on HR/RR/EtCO2 noise.
    if (rhythmMsg && l.key !== 'spo2') continue;
    const key: AlarmKey = l.key === 'sbp' ? 'bp' : l.key;
    const r = Math.round(v);
    if (v < l.critLow) out.push({ key, priority: 'high', message: `${l.label} ${r} LOW` });
    else if (v > l.critHigh) out.push({ key, priority: 'high', message: `${l.label} ${r} HIGH` });
    else if (v < l.low) out.push({ key, priority: 'medium', message: `${l.label} ${r} LOW` });
    else if (v > l.high) out.push({ key, priority: 'medium', message: `${l.label} ${r} HIGH` });
  }
  return out.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1));
}

export function topPriority(alarms: readonly ActiveAlarm[]): Priority | null {
  if (alarms.some((a) => a.priority === 'high')) return 'high';
  return alarms.length ? 'medium' : null;
}

/** Pulse-oximetry beep pitch falls as saturation falls: half a semitone per 1 %. */
export function spo2ToFrequency(spo2: number): number {
  const s = Math.max(50, Math.min(100, spo2));
  return 880 * Math.pow(2, (-(100 - s) * 0.5) / 12);
}
