import { describe, expect, it } from 'vitest';
import { SimpleEngine } from '../../../src/engine/engine.ts';
import { runPolicy, runScript } from '../../../src/engine/replay.ts';
import type { Action, CaseDef } from '../../../src/engine/types.ts';
import { caseById, LIBRARY, min } from '../helpers.ts';

const ANA = caseById('anaphylaxis-01');
const withArrestRhythm = (r: 'vf' | 'pea'): CaseDef => ({
  ...ANA,
  processes: ANA.processes.map((p) => ({ ...p, arrestRhythm: r })),
});
const codes = (evs: { code: string }[]) => evs.map((e) => e.code);

/** A competent ALS team: pads, CPR, shock or pulse check every 2 min, drugs per algorithm. */
function alsPolicy() {
  let lastCycle = -Infinity;
  let shocks = 0;
  let lastAdr = -Infinity;
  return (e: SimpleEngine): Action[] => {
    const st = e.status();
    const out: Action[] = [];
    if (!st.arrest) return out;
    if (!st.devices.includes('defib_pads'))
      out.push({ kind: 'device', deviceId: 'defib_pads', on: true });
    if (!st.access.iv) out.push({ kind: 'procedure', procedureId: 'iv_access' });
    if (!st.cpr) out.push({ kind: 'cpr', on: true });
    const shockable = ['vf', 'pvt'].includes(e.vitals().rhythm);
    if (e.time - lastCycle >= 120) {
      lastCycle = e.time;
      if (shockable) {
        out.push({ kind: 'shock', joules: 150 });
        shocks++;
      } else out.push({ kind: 'pulse_check' });
    }
    const adrDue = shockable ? shocks >= 3 : true;
    if (adrDue && e.time - lastAdr >= 240) {
      lastAdr = e.time;
      out.push({ kind: 'drug', drugId: 'adrenaline', route: 'IV', dose: 1 });
    }
    if (shockable && shocks === 3)
      out.push({ kind: 'drug', drugId: 'amiodarone', route: 'IV', dose: 300 });
    return out;
  };
}

describe('cardiac arrest and ALS', () => {
  it('without resuscitation the patient dies after the maximum arrest time', () => {
    const r = runScript(LIBRARY, ANA, 3, [], { maxSec: min(45) });
    expect(r.outcome).toBe('died');
    expect(r.arrestT).not.toBeNull();
    const died = r.events.find((e) => e.code === 'outcome:died');
    expect(died?.t).toBe((r.arrestT ?? 0) + 900);
  });

  it('good ALS in a VF arrest usually achieves ROSC; no CPR never does', () => {
    const vf = withArrestRhythm('vf');
    let rosc = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    for (const seed of seeds) {
      const r = runPolicy(LIBRARY, vf, seed, alsPolicy(), { maxSec: min(40) });
      if (r.events.some((e) => e.code === 'rosc')) rosc++;
      expect(r.events.some((e) => e.code.startsWith('adverse:shock'))).toBe(false);
    }
    expect(rosc / seeds.length).toBeGreaterThanOrEqual(0.6);
  });

  it('flags a shock to a non-shockable rhythm as harmful', () => {
    const e = new SimpleEngine(LIBRARY);
    e.load(withArrestRhythm('pea'), 1);
    while (!e.status().arrest) e.step(30);
    e.apply({ kind: 'device', deviceId: 'defib_pads', on: true });
    const evs = e.apply({ kind: 'shock', joules: 150 });
    expect(codes(evs)).toEqual(['shock', 'adverse:shock_nonshockable']);
    expect(evs[1]?.data?.['harm']).toBe(true);
    expect(e.status().arrest).toBe(true);
  });

  it('refuses CPR with a pulse, needs pads to shock, and an unsynchronised shock with a pulse causes VF', () => {
    const e = new SimpleEngine(LIBRARY);
    e.load(ANA, 1);
    expect(codes(e.apply({ kind: 'cpr', on: true }))).toEqual(['blocked:cpr']);
    expect(codes(e.apply({ kind: 'shock', joules: 150 }))).toEqual(['blocked:pads']);
    e.apply({ kind: 'device', deviceId: 'defib_pads', on: true });
    expect(codes(e.apply({ kind: 'shock', joules: 150 }))).toEqual([
      'adverse:shock_with_pulse',
      'arrest',
    ]);
    expect(e.vitals().rhythm).toBe('vf');
    expect(e.vitals().sbp).toBeNull();
  });

  it('pulse checks report the rhythm, and CPR raises EtCO2', () => {
    const e = new SimpleEngine(LIBRARY);
    e.load(withArrestRhythm('pea'), 2);
    while (!e.status().arrest) e.step(30);
    expect(e.vitals().etco2).toBeLessThan(5);
    e.apply({ kind: 'cpr', on: true });
    expect(e.vitals().etco2).toBeGreaterThan(10);
    const check = e.apply({ kind: 'pulse_check' })[0];
    expect(check?.text).toMatch(/No pulse\. Pulseless electrical activity: non-shockable\./);
  });
});

describe('infusions', () => {
  it('a noradrenaline infusion raises BP while running and wears off when stopped', () => {
    const e = new SimpleEngine(LIBRARY);
    e.load(ANA, 4);
    const rate = { kind: 'infusion', drugId: 'noradrenaline', rate: 0.2 } as const;
    expect(codes(e.apply(rate))).toEqual(['blocked:access:infusion:noradrenaline']);
    // A control run with the same seed and no infusion separates drug effect from disease.
    const control = new SimpleEngine(LIBRARY);
    control.load(ANA, 4);
    e.apply({ kind: 'procedure', procedureId: 'iv_access' });
    control.apply({ kind: 'procedure', procedureId: 'iv_access' });
    expect(codes(e.apply(rate))).toEqual(['infusion:noradrenaline']);
    e.step(300);
    control.step(300);
    const lift = () => (e.vitals().sbp ?? 0) - (control.vitals().sbp ?? 0);
    expect(lift()).toBeGreaterThan(20);
    expect(e.status().infusions).toEqual([{ drugId: 'noradrenaline', rate: 0.2 }]);
    expect(codes(e.apply({ kind: 'infusion', drugId: 'noradrenaline', rate: 0 }))).toEqual([
      'infusion:noradrenaline:stop',
    ]);
    e.step(600);
    control.step(600);
    expect(e.status().infusions).toEqual([]);
    expect(Math.abs(lift())).toBeLessThan(7);
  });

  it('warns about rates outside the usual range', () => {
    const e = new SimpleEngine(LIBRARY);
    e.load(ANA, 4);
    e.apply({ kind: 'procedure', procedureId: 'iv_access' });
    const evs = e.apply({ kind: 'infusion', drugId: 'noradrenaline', rate: 3 });
    expect(codes(evs)).toEqual(['infusion:noradrenaline', 'rate-range:noradrenaline']);
  });
});
