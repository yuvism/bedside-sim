/**
 * Phase 4 acceptance: every case has an ideal run that reaches a good
 * outcome and a do-nothing run that reaches a bad one, across seeds.
 */
import { describe, expect, it } from 'vitest';
import { CASES, LIBRARY } from '../../../src/content/library.ts';
import { runPolicy, runScript } from '../../../src/engine/replay.ts';
import { lastDiagnosis, scoreRun } from '../../../src/engine/scoring.ts';
import { IDEAL } from './policies.ts';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const MAX = 120 * 60;
const IDLE_MAX = 180 * 60;

describe('case library', () => {
  it('has eleven cases, each with an ideal-run policy', () => {
    expect(CASES.length).toBe(11);
    for (const c of CASES) expect(IDEAL[c.id], c.id).toBeDefined();
  });

  for (const c of CASES) {
    describe(c.id, () => {
      it('ideal run stabilises the patient and scores well', () => {
        const scores: number[] = [];
        let stable = 0;
        for (const seed of SEEDS) {
          const r = runPolicy(LIBRARY, c, seed, IDEAL[c.id]!(), { maxSec: MAX });
          if (r.outcome === 'stabilised') stable++;
          const s = scoreRun(c, {
            events: r.events,
            trace: r.trace,
            outcome: r.outcome ?? 'ended',
            diagnosis: lastDiagnosis(r.events),
          });
          scores.push(s.percent);
          expect(
            r.events.some((e) => e.data?.['harm'] === true),
            `${c.id} seed ${seed} harm`,
          ).toBe(false);
        }
        expect(
          stable / SEEDS.length,
          `${c.id} stabilised ${stable}/${SEEDS.length}`,
        ).toBeGreaterThanOrEqual(0.875);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        expect(mean, `${c.id} mean score`).toBeGreaterThanOrEqual(80);
      });

      it('doing nothing ends badly', () => {
        for (const seed of SEEDS.slice(0, 4)) {
          const r = runScript(LIBRARY, c, seed, [], { maxSec: IDLE_MAX });
          expect(r.outcome, `${c.id} seed ${seed}`).toBe('died');
        }
      });
    });
  }
});
