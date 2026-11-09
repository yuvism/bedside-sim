/**
 * Rhythm state machine.
 *
 * Sinus-family rhythms (sinus, sinus tachy, sinus brady) follow the heart
 * rate. Every other rhythm is latched: it is entered through a rule (from the
 * case file or the arrest logic) and stays until a rule or a procedure moves
 * it on. Probabilistic rules draw from the seeded RNG, so runs replay exactly.
 */
import type { RhythmRule } from './caseTypes.ts';
import { evalCondition, type ConditionContext } from './conditions.ts';
import type { Rng } from './rng.ts';
import { NON_PERFUSING, type Rhythm } from './types.ts';

export const SINUS_FAMILY: readonly Rhythm[] = ['sinus', 'sinus_tachy', 'sinus_brady'];

export const RHYTHM_LABELS: Record<Rhythm, string> = {
  sinus: 'Sinus rhythm',
  sinus_tachy: 'Sinus tachycardia',
  sinus_brady: 'Sinus bradycardia',
  af: 'Atrial fibrillation',
  svt: 'Supraventricular tachycardia',
  vt: 'Ventricular tachycardia',
  pvt: 'Pulseless ventricular tachycardia',
  vf: 'Ventricular fibrillation',
  pea: 'Pulseless electrical activity',
  asystole: 'Asystole',
  stemi: 'Sinus rhythm with ST elevation',
};

/** Shockable arrest rhythms (ALS). */
export const SHOCKABLE: readonly Rhythm[] = ['vf', 'pvt'];

export const isPerfusing = (r: Rhythm) => !NON_PERFUSING.includes(r);
export const isSinusFamily = (r: Rhythm) => SINUS_FAMILY.includes(r);

export function sinusFor(hr: number): Rhythm {
  if (hr >= 100) return 'sinus_tachy';
  if (hr < 50) return 'sinus_brady';
  return 'sinus';
}

/** Electrical rate shown on the monitor during arrest rhythms (null = unmeasurable). */
export function arrestMonitorRate(r: Rhythm): number | null {
  if (r === 'vf') return null;
  if (r === 'asystole') return 0;
  if (r === 'pvt') return 190;
  if (r === 'pea') return 42;
  return null;
}

export interface RhythmStep {
  rhythm: Rhythm;
  ruleId: string | null;
}

/**
 * One rhythm update. `hr` is the physiological rate before rhythm overrides.
 * Rules are checked in order; the first that triggers wins.
 */
export function nextRhythm(
  current: Rhythm,
  hr: number,
  rules: readonly RhythmRule[],
  ctx: ConditionContext,
  rng: Rng,
  dtMin: number,
): RhythmStep {
  for (const rule of rules) {
    if (rule.to === current) continue;
    if (rule.from && !rule.from.includes(current)) continue;
    if (!evalCondition(rule.when, ctx)) continue;
    if (rule.probPerMin !== undefined) {
      const p = 1 - Math.exp(-rule.probPerMin * dtMin);
      if (!rng.chance(p)) continue;
    }
    return { rhythm: rule.to, ruleId: rule.id };
  }
  if (isSinusFamily(current)) return { rhythm: sinusFor(hr), ruleId: null };
  return { rhythm: current, ruleId: null };
}
