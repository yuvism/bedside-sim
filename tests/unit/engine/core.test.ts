import { describe, expect, it } from 'vitest';
import { evalCondition, type ConditionContext } from '../../../src/engine/conditions.ts';
import {
  AIR_FIO2,
  inverseSeveringhaus,
  physiology,
  severinghaus,
  type PhysInput,
} from '../../../src/engine/coupling.ts';
import { bandFor, fillTemplate } from '../../../src/engine/narrative.ts';
import {
  addDose,
  drugEffects,
  emaxEffect,
  newDrugState,
  stepDrug,
} from '../../../src/engine/pharmacology.ts';
import { accumulateEffects, effectValue, stepProcess } from '../../../src/engine/processes.ts';
import { nextRhythm, sinusFor } from '../../../src/engine/rhythms.ts';
import { ouStep, Rng, seedToState } from '../../../src/engine/rng.ts';
import type { DrugDef, ProcessState, Vitals } from '../../../src/engine/types.ts';
import type { ProcessDef } from '../../../src/engine/caseTypes.ts';

describe('rng', () => {
  it('replays the same sequence from the same seed and differs between seeds', () => {
    const a = new Rng(seedToState(1));
    const b = new Rng(seedToState(1));
    const c = new Rng(seedToState(2));
    const xs = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(xs);
  });

  it('stays in [0, 1) and has a sensible mean and normal spread', () => {
    const r = new Rng(seedToState(123));
    const u = Array.from({ length: 20000 }, () => r.next());
    expect(Math.min(...u)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...u)).toBeLessThan(1);
    expect(u.reduce((s, x) => s + x, 0) / u.length).toBeCloseTo(0.5, 1);
    const n = Array.from({ length: 20000 }, () => r.normal());
    const mean = n.reduce((s, x) => s + x, 0) / n.length;
    const sd = Math.sqrt(n.reduce((s, x) => s + (x - mean) ** 2, 0) / n.length);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
  });

  it('resumes from a saved state', () => {
    const a = new Rng(seedToState(9));
    a.next();
    const saved = a.state;
    const next = a.next();
    expect(new Rng(saved).next()).toBe(next);
  });

  it('OU noise decays towards zero without input', () => {
    expect(ouStep(10, 20, 1, 20, 0)).toBeCloseTo(10 * Math.exp(-1), 6);
  });
});

const DRUG: DrugDef = {
  id: 'x',
  name: 'X',
  drugClass: 'test',
  unit: 'mg',
  halfLifeMin: 2,
  routes: [
    { route: 'IV', label: 'IV', standardDose: 1, bioavailability: 1, absorptionHalfLifeMin: 0 },
    { route: 'IM', label: 'IM', standardDose: 1, bioavailability: 0.5, absorptionHalfLifeMin: 1 },
  ],
  effects: [
    { target: 'hr', emax: 40, ec50: 1 },
    { target: 'block:skin', emax: 0.8, ec50: 1 },
  ],
};
const route = (r: 'IV' | 'IM') => DRUG.routes.find((x) => x.route === r)!;

describe('pharmacology', () => {
  it('halves the central amount every half-life after an IV bolus', () => {
    const s = newDrugState('x');
    addDose(s, route('IV'), 1, 0);
    for (let i = 0; i < 120; i++) stepDrug(DRUG, s, 1 / 60);
    expect(s.central).toBeCloseTo(0.5, 6);
  });

  it('absorbs an IM dose from the depot, with bioavailability, then clears it', () => {
    const s = newDrugState('x');
    addDose(s, route('IM'), 1, 0);
    expect(s.central).toBe(0);
    let peak = 0;
    for (let i = 0; i < 60 * 30; i++) {
      stepDrug(DRUG, s, 1 / 60);
      peak = Math.max(peak, s.central);
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.5);
    expect(s.central).toBeLessThan(0.001);
  });

  it('uses the Emax model and combines blocks multiplicatively', () => {
    expect(emaxEffect(1, 40, 1)).toBe(20);
    expect(emaxEffect(0, 40, 1)).toBe(0);
    const s = newDrugState('x');
    addDose(s, route('IV'), 1, 0);
    const fx = drugEffects(new Map([['x', DRUG]]), [s], 70);
    expect(fx.add['hr']).toBeCloseTo(20, 6);
    expect(fx.block['skin']).toBeCloseTo(0.4, 6);
    const heavy = drugEffects(new Map([['x', DRUG]]), [s], 35);
    expect(heavy.add['hr']!).toBeGreaterThan(fx.add['hr']!);
  });
});

const PROC: ProcessDef = {
  id: 'p',
  type: 'p',
  label: 'P',
  initial: 50,
  ratePerMin: 6,
  decayTauMin: 20,
  effects: [
    { target: 'sbp', perPoint: -1 },
    { target: 'rr', perPoint: 0.5, above: 40, group: 'g' },
  ],
};

describe('processes', () => {
  it('progresses with a decaying drive and responds to treatment', () => {
    const s: ProcessState = { id: 'p', severity: 50, rateMul: 1, sensitivity: 1 };
    stepProcess(PROC, s, 0, 1, 0);
    expect(s.severity).toBeCloseTo(56, 6);
    stepProcess(PROC, s, 20, 1, -10);
    expect(s.severity).toBeCloseTo(56 + 6 * Math.exp(-1) - 10, 6);
  });

  it('maps severity onto effects with thresholds and blocks', () => {
    expect(effectValue({ target: 'rr', perPoint: 0.5, above: 40 }, 30)).toBe(0);
    expect(effectValue({ target: 'rr', perPoint: 0.5, above: 40 }, 60)).toBe(10);
    const out: Record<string, number> = {};
    accumulateEffects(PROC, { id: 'p', severity: 60, rateMul: 1, sensitivity: 1 }, { g: 0.5 }, out);
    expect(out['sbp']).toBe(-60);
    expect(out['rr']).toBe(5);
  });
});

const BASE_INPUT: PhysInput = {
  baseline: { hr: 80, sbp: 120, dbp: 70, rr: 14, temp: 37, glucose: 5 },
  base: { hr: 80, sbp: 120, dbp: 70, rr: 14 },
  labs: { lactate: 1, hco3: 24 },
  d: {},
  fio2: AIR_FIO2,
  noise: {},
  weightKg: 70,
};

describe('coupling', () => {
  it('Severinghaus curve is monotonic and its inverse round-trips', () => {
    expect(severinghaus(27)).toBeCloseTo(0.5, 1);
    expect(severinghaus(100)).toBeGreaterThan(0.97);
    expect(inverseSeveringhaus(severinghaus(60))).toBeCloseTo(60, 3);
  });

  it('gives normal vitals at baseline', () => {
    const p = physiology(BASE_INPUT);
    expect(p.hr).toBe(80);
    expect(p.sbp).toBe(120);
    expect(p.spo2).toBeGreaterThan(96);
    expect(p.gcs).toBe(15);
    expect(p.labs['ph']).toBeCloseTo(7.4, 1);
    expect(p.etco2).toBeGreaterThan(30);
  });

  it('SpO2 falls with shunt and V/Q mismatch and rises with FiO2', () => {
    const sick = physiology({ ...BASE_INPUT, d: { vq: 5, shunt: 0.12 } });
    const sickO2 = physiology({ ...BASE_INPUT, d: { vq: 5, shunt: 0.12 }, fio2: 0.6 });
    expect(sick.spo2).toBeLessThan(92);
    expect(sickO2.spo2).toBeGreaterThan(sick.spo2 + 4);
  });

  it('baroreflex raises HR, and GCS falls, as BP drops', () => {
    const shocked = physiology({ ...BASE_INPUT, d: { sbp: -60 } });
    expect(shocked.hr).toBeGreaterThan(100);
    expect(shocked.gcs).toBeLessThan(15);
    expect(shocked.labs['urine']!).toBeLessThan(physiology(BASE_INPUT).labs['urine']!);
  });
});

const VITALS: Vitals = {
  hr: 120,
  sbp: 85,
  dbp: 50,
  map: 62,
  spo2: 94,
  rr: 24,
  etco2: 30,
  temp: 37,
  gcs: 15,
  glucose: 5,
  rhythm: 'sinus_tachy',
  ectopy: false,
};
const ctx = (over: Partial<ConditionContext> = {}): ConditionContext => ({
  t: 120,
  severity: () => 50,
  vitals: VITALS,
  labs: { k: 4 },
  drugGiven: (id) => id === 'adrenaline',
  deviceOn: () => false,
  access: { iv: true, io: false },
  arrest: false,
  ...over,
});

describe('conditions, narrative and rhythm', () => {
  it('evaluates ranges, logic and state checks', () => {
    expect(evalCondition({ severity: 'p', gte: 40, lt: 60 }, ctx())).toBe(true);
    expect(evalCondition({ vital: 'sbp', lt: 80 }, ctx())).toBe(false);
    expect(evalCondition({ all: [{ drugGiven: 'adrenaline' }, { access: 'iv' }] }, ctx())).toBe(
      true,
    );
    expect(evalCondition({ any: [{ device: 'o2' }, { not: { arrest: false } }] }, ctx())).toBe(
      false,
    );
    expect(evalCondition({ vital: 'sbp', gte: 0 }, ctx({ vitals: { ...VITALS, sbp: null } }))).toBe(
      false,
    );
  });

  it('picks severity bands and fills templates', () => {
    expect(bandFor({ process: 'p', cutoffs: [30, 65] }, 10)).toBe(0);
    expect(bandFor({ process: 'p', cutoffs: [30, 65] }, 30)).toBe(1);
    expect(bandFor({ process: 'p', cutoffs: [30, 65] }, 90)).toBe(2);
    expect(
      fillTemplate('HR {hr}, pH {ph:2} on {o2} {nope}', { hr: 99.6, ph: 7.314, o2: 'air' }),
    ).toBe('HR 100, pH 7.31 on air {nope}');
    expect(fillTemplate('BP {sbp}', { sbp: null })).toBe('BP --');
  });

  it('follows HR within the sinus family and latches rule-driven rhythms', () => {
    const rng = new Rng(1);
    expect(sinusFor(130)).toBe('sinus_tachy');
    expect(nextRhythm('sinus', 40, [], ctx(), rng, 1 / 60).rhythm).toBe('sinus_brady');
    const rule = { id: 'hyperk', to: 'vf' as const, when: { lab: 'k', gte: 7 } };
    expect(nextRhythm('sinus', 80, [rule], ctx(), rng, 1 / 60).rhythm).toBe('sinus');
    expect(nextRhythm('sinus', 80, [rule], ctx({ labs: { k: 8 } }), rng, 1 / 60).rhythm).toBe('vf');
    expect(nextRhythm('af', 150, [], ctx(), rng, 1 / 60).rhythm).toBe('af');
  });
});
