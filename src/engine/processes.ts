/**
 * Disease processes. Each has a severity 0–100 that progresses on its own,
 * is pushed down by treatments, and maps onto vitals, labs and signs through
 * per-point effects defined in the case file.
 *
 *   dS/dt = rate·rateMul·e^(−t/τ) − recovery·S + Σ(treatment)·sensitivity
 */
import type { ProcessDef, ProcessEffect } from './caseTypes.ts';
import type { Rng } from './rng.ts';
import type { ProcessState } from './types.ts';

export const SEVERITY_MAX = 100;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Draws seeded variation in a fixed order, so the same seed gives the same patient. */
export function initProcess(def: ProcessDef, rng: Rng): ProcessState {
  const severity = clamp(rng.jitter(def.initial, def.initialJitter ?? 0), 0, SEVERITY_MAX);
  const rateMul = 1 + rng.jitter(0, def.rateJitterPct ?? 0) / 100;
  const sensitivity = 1 + rng.jitter(0, def.sensitivityJitterPct ?? 0) / 100;
  return { id: def.id, severity, rateMul, sensitivity };
}

/** Untreated drive in severity points per minute at time tMin. */
export function drive(def: ProcessDef, s: ProcessState, tMin: number): number {
  const decay = def.decayTauMin ? Math.exp(-tMin / def.decayTauMin) : 1;
  return def.ratePerMin * s.rateMul * decay;
}

/**
 * Advance one process by dtMin minutes.
 * @param treatmentPerMin summed drug effect on process:<type> (negative = improving)
 */
export function stepProcess(
  def: ProcessDef,
  s: ProcessState,
  tMin: number,
  dtMin: number,
  treatmentPerMin: number,
): void {
  const recovery = (def.recoveryPerMin ?? 0) * s.severity;
  const rate = drive(def, s, tMin) - recovery + treatmentPerMin * s.sensitivity;
  s.severity = clamp(s.severity + rate * dtMin, 0, SEVERITY_MAX);
}

export function effectValue(e: ProcessEffect, severity: number): number {
  const x = Math.max(0, severity - (e.above ?? 0));
  if (x === 0) return 0;
  const exp = e.exponent ?? 1;
  return e.perPoint * (exp === 1 ? x : Math.pow(x, exp));
}

/** Add this process's effects into `out`, scaled down by any active blocks. */
export function accumulateEffects(
  def: ProcessDef,
  s: ProcessState,
  blocks: Readonly<Record<string, number>>,
  out: Record<string, number>,
): void {
  for (const e of def.effects) {
    let v = effectValue(e, s.severity);
    if (v === 0) continue;
    if (e.group) v *= 1 - (blocks[e.group] ?? 0);
    out[e.target] = (out[e.target] ?? 0) + v;
  }
}
