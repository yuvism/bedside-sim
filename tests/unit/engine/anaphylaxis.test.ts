/**
 * Phase 1 acceptance tests for anaphylaxis-01, run over 50 seeds.
 * (a) untreated → arrest between 10 and 18 sim minutes
 * (b) IM adrenaline at 2:00 → severity down and SBP up within 3 minutes
 * (c) one dose wears off and usually isn't enough; a second dose stabilises
 * (d) same seed + same actions → identical run
 */
import { describe, expect, it } from 'vitest';
import { SimpleEngine } from '../../../src/engine/engine.ts';
import { runScript } from '../../../src/engine/replay.ts';
import { caseById, imAdrenaline, LIBRARY, min, SEEDS } from '../helpers.ts';

const CASE = caseById('anaphylaxis-01');
const severity = (e: SimpleEngine) => e.severities()['anaphylaxis'] ?? NaN;

describe('anaphylaxis-01 acceptance', () => {
  it('(a) untreated, arrests between 10 and 18 sim minutes in every seed', () => {
    const times = SEEDS.map((seed) => {
      const r = runScript(LIBRARY, CASE, seed, [], { maxSec: min(30) });
      expect(r.outcome).toBe('arrest');
      const arrest = r.events.find((e) => e.code === 'outcome:arrest');
      return (arrest?.t ?? Infinity) / 60;
    });
    expect(Math.min(...times)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...times)).toBeLessThanOrEqual(18);
  });

  it('(b) IM adrenaline at 2:00 drops severity and raises SBP within 3 minutes', () => {
    for (const seed of SEEDS) {
      const at: Record<number, { s: number; sbp: number }> = {};
      runScript(LIBRARY, CASE, seed, [imAdrenaline(min(2))], {
        maxSec: min(5),
        onTick: (e) => {
          if (e.time === min(2) || e.time === min(5)) {
            at[e.time] = { s: severity(e), sbp: e.vitals().sbp ?? NaN };
          }
        },
      });
      const before = at[min(2)];
      const after = at[min(5)];
      expect(before && after).toBeTruthy();
      if (!before || !after) continue;
      expect(after.s).toBeLessThan(before.s);
      expect(after.sbp).toBeGreaterThan(before.sbp);
    }
  });

  it('(c) one dose wears off: most seeds need a second dose, which stabilises', () => {
    let singleFailed = 0;
    let doubleStable = 0;
    for (const seed of SEEDS) {
      let lowest = Infinity;
      let rebound = false;
      const one = runScript(LIBRARY, CASE, seed, [imAdrenaline(min(2))], {
        maxSec: min(30),
        onTick: (e) => {
          const s = severity(e);
          lowest = Math.min(lowest, s);
          if (s > lowest + 5) rebound = true;
        },
      });
      if (one.outcome !== 'stabilised') {
        singleFailed++;
        expect(rebound).toBe(true); // the effect wore off and severity climbed again
      }
      const two = runScript(LIBRARY, CASE, seed, [imAdrenaline(min(2)), imAdrenaline(min(7))], {
        maxSec: min(30),
      });
      if (two.outcome === 'stabilised') doubleStable++;
    }
    expect(singleFailed / SEEDS.length).toBeGreaterThanOrEqual(0.7);
    expect(doubleStable / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('(d) same seed and actions give an identical run; a different seed does not', () => {
    const script = [
      imAdrenaline(min(1.5)),
      { t: min(1), action: { kind: 'device', deviceId: 'o2_nrb', on: true } } as const,
      { t: min(2), action: { kind: 'procedure', procedureId: 'iv_access' } } as const,
      { t: min(2.5), action: { kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 } } as const,
      imAdrenaline(min(6.5)),
    ];
    const a = runScript(LIBRARY, CASE, 42, script, { maxSec: min(20), stopOnOutcome: false });
    const b = runScript(LIBRARY, CASE, 42, script, { maxSec: min(20), stopOnOutcome: false });
    const c = runScript(LIBRARY, CASE, 43, script, { maxSec: min(20), stopOnOutcome: false });
    expect(b.trace).toEqual(a.trace);
    expect(b.events).toEqual(a.events);
    expect(b.final).toEqual(a.final);
    expect(c.trace).not.toEqual(a.trace);
  });

  it('snapshot and restore resume an identical run', () => {
    const e1 = new SimpleEngine(LIBRARY);
    e1.load(CASE, 7);
    e1.step(90);
    e1.apply({ kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 0.5 });
    const snap = e1.snapshot();
    const e2 = new SimpleEngine(LIBRARY);
    e2.load(CASE, 999);
    e2.restore(snap);
    const ev1 = e1.step(300);
    const ev2 = e2.step(300);
    expect(ev2).toEqual(ev1);
    expect(e2.vitals()).toEqual(e1.vitals());
    expect(e2.snapshot()).toEqual(e1.snapshot());
  });
});
