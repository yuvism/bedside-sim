/**
 * Cardiac arrest and the ALS loop: CPR, defibrillation, rhythm/pulse checks,
 * return of spontaneous circulation (ROSC) and death after prolonged arrest.
 *
 * ROSC is a seeded chance at each shock (shockable rhythms) or pulse check
 * after ≥ 90 s of CPR (non-shockable rhythms). It rises with CPR fraction,
 * early action, fixing the cause, and adrenaline/amiodarone per ALS, and it
 * falls with time. The weights are teaching parameters (see ROSC below).
 */
import { compute, event, type Model } from './model.ts';
import { RHYTHM_LABELS, SHOCKABLE } from './rhythms.ts';
import type { Rhythm, SimEvent } from './types.ts';

export const DEFAULT_MAX_ARREST_SEC = 900;
export const PADS_DEVICE = 'defib_pads';

/** Teaching parameters for the ROSC model (listed in docs/clinical-review.md). */
export const ROSC = {
  baseShock: 0.45,
  baseCheck: 0.35,
  minCheckCprSec: 90,
  timeTauMin: 10,
  causeUnfixedShockable: 0.55,
  causeUnfixedNonShockable: 0.12,
  causeFixedMargin: 20,
  adrenalineGain: 1.25,
  amiodaroneGain: 1.3,
  noAdrenalineNonShockable: 0.4,
  vfToAsystolePerMinNoCpr: 0.15,
  vfToAsystolePerMinCpr: 0.03,
  maxChance: 0.92,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function enterArrest(m: Model, rhythm: Rhythm): SimEvent[] {
  const s = m.s;
  s.arrest = true;
  s.arrestT = s.t;
  s.arrests += 1;
  s.rhythm = rhythm;
  s.als = { t0: s.t, cprSec: 0, shocks: 0, cprSinceCheck: 0 };
  m.out = compute(m);
  return [
    event(m, 'danger', 'arrest', `Cardiac arrest. ${RHYTHM_LABELS[rhythm]} on the monitor.`, {
      rhythm,
    }),
  ];
}

function givenDuringArrest(m: Model, drugId: string, t0: number): boolean {
  const d = m.s.drugs.find((x) => x.drugId === drugId);
  return !!d?.doses.some((x) => x.t >= t0 && (x.route === 'IV' || x.route === 'IO'));
}

/** Is every arrest-causing process now well below its arrest threshold? */
export function causeFixed(m: Model): boolean {
  return m.s.processes.every((ps) => {
    const def = m.defs.processes.get(ps.id);
    return def?.arrestAt === undefined || ps.severity < def.arrestAt - ROSC.causeFixedMargin;
  });
}

export function roscChance(m: Model, via: 'shock' | 'check'): number {
  const { s } = m;
  const a = s.als;
  if (!a) return 0;
  const elapsed = Math.max(1, s.t - a.t0);
  const quality = 0.3 + 0.7 * clamp(a.cprSec / elapsed, 0, 1);
  const timeF = Math.exp(-elapsed / 60 / ROSC.timeTauMin);
  const shockable = SHOCKABLE.includes(s.rhythm);
  const fixed = causeFixed(m);
  const cause = fixed ? 1 : shockable ? ROSC.causeUnfixedShockable : ROSC.causeUnfixedNonShockable;
  const adr = givenDuringArrest(m, 'adrenaline', a.t0);
  const amio = givenDuringArrest(m, 'amiodarone', a.t0);
  let drugs = adr ? ROSC.adrenalineGain : 1;
  if (shockable && amio) drugs *= ROSC.amiodaroneGain;
  if (!shockable && !adr) drugs *= ROSC.noAdrenalineNonShockable;
  const base = via === 'shock' ? ROSC.baseShock : ROSC.baseCheck;
  return clamp(base * quality * timeF * cause * drugs, 0, ROSC.maxChance);
}

function rosc(m: Model): SimEvent[] {
  const s = m.s;
  const minutes = Math.round((s.t - (s.als?.t0 ?? s.t)) / 6) / 10;
  s.arrest = false;
  s.als = null;
  s.cpr = false;
  s.rhythm = 'sinus_tachy';
  for (const ps of s.processes) {
    const def = m.defs.processes.get(ps.id);
    if (def?.arrestAt !== undefined) ps.severity = Math.min(ps.severity, def.arrestAt - 15);
  }
  m.out = compute(m);
  return [event(m, 'system', 'rosc', `Return of spontaneous circulation after ${minutes} min.`)];
}

export function setCpr(m: Model, on: boolean): SimEvent[] {
  const s = m.s;
  if (on && !s.arrest) {
    return [event(m, 'warn', 'blocked:cpr', 'There is a pulse. CPR is not indicated.')];
  }
  if (on === s.cpr) {
    return [event(m, 'system', 'noop:cpr', on ? 'CPR is already running.' : 'CPR is not running.')];
  }
  s.cpr = on;
  m.out = compute(m);
  return [event(m, 'action', on ? 'cpr:on' : 'cpr:off', on ? 'CPR started, 30:2.' : 'CPR paused.')];
}

export function shock(m: Model, joules: number): SimEvent[] {
  const s = m.s;
  if (!s.devices.includes(PADS_DEVICE)) {
    return [event(m, 'warn', 'blocked:pads', 'Attach the defibrillator pads first.')];
  }
  if (!s.arrest || !s.als) {
    const harm = event(
      m,
      'danger',
      'adverse:shock_with_pulse',
      'Unsynchronised shock delivered to a patient with a pulse. Ventricular fibrillation follows.',
      { harm: true },
    );
    return [harm, ...enterArrest(m, 'vf')];
  }
  const a = s.als;
  a.shocks += 1;
  a.cprSinceCheck = 0;
  const out = [
    event(m, 'action', 'shock', `Shock ${a.shocks} delivered, ${joules} J.`, {
      joules,
      n: a.shocks,
    }),
  ];
  if (!SHOCKABLE.includes(s.rhythm)) {
    out.push(
      event(
        m,
        'danger',
        'adverse:shock_nonshockable',
        `Shock delivered to a non-shockable rhythm (${RHYTHM_LABELS[s.rhythm]}). No benefit, and compressions were interrupted.`,
        { harm: true },
      ),
    );
    return out;
  }
  if (m.rng.chance(roscChance(m, 'shock'))) return [...out, ...rosc(m)];
  out.push(event(m, 'system', 'shock:no-rosc', 'Still in a shockable rhythm. Resume CPR.'));
  return out;
}

export function pulseCheck(m: Model): SimEvent[] {
  const s = m.s;
  const a = s.als;
  if (!s.arrest || !a) {
    const hr = Math.round(m.out.vitals.hr ?? 0);
    return [event(m, 'finding', 'pulse', `Central pulse present, rate about ${hr}.`)];
  }
  const shockable = SHOCKABLE.includes(s.rhythm);
  const out = [
    event(
      m,
      'finding',
      'pulse',
      `No pulse. ${RHYTHM_LABELS[s.rhythm]}: ${shockable ? 'shockable' : 'non-shockable'}.`,
    ),
  ];
  const enoughCpr = a.cprSinceCheck >= ROSC.minCheckCprSec;
  a.cprSinceCheck = 0;
  if (!shockable && enoughCpr && m.rng.chance(roscChance(m, 'check'))) out.push(...rosc(m));
  return out;
}

/** Per-tick bookkeeping while in arrest. */
export function arrestTick(m: Model, dtSec: number): SimEvent[] {
  const s = m.s;
  const a = s.als;
  if (!a) return [];
  if (s.cpr) {
    a.cprSec += dtSec;
    a.cprSinceCheck += dtSec;
  }
  const out: SimEvent[] = [];
  if (SHOCKABLE.includes(s.rhythm) && s.t - a.t0 > 240) {
    const perMin = s.cpr ? ROSC.vfToAsystolePerMinCpr : ROSC.vfToAsystolePerMinNoCpr;
    if (m.rng.chance(1 - Math.exp((-perMin * dtSec) / 60))) {
      s.rhythm = 'asystole';
      m.out = compute(m);
      out.push(event(m, 'warn', 'rhythm:asystole', 'The rhythm has deteriorated to asystole.'));
    }
  }
  const max = m.c.outcomes.maxArrestSec ?? DEFAULT_MAX_ARREST_SEC;
  if (!s.outcome && s.t - a.t0 >= max) {
    s.outcome = 'died';
    s.cpr = false;
    out.push(
      event(
        m,
        'danger',
        'died',
        `Resuscitation stopped after ${Math.round(max / 60)} minutes. The patient has died.`,
      ),
      event(m, 'outcome', 'outcome:died', 'Patient died.'),
    );
  }
  return out;
}
