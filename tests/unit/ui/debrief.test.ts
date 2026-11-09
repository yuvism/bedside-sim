import { beforeEach, describe, expect, it } from 'vitest';
import { clearProgress, getProgress, recordAttempt } from '../../../src/app/progress.ts';
import { Session } from '../../../src/app/session.ts';
import { runScript } from '../../../src/engine/replay.ts';
import { buildChartData, nearestPoint } from '../../../src/ui/debrief/chartData.ts';
import { caseById, imAdrenaline, LIBRARY, min } from '../helpers.ts';

const CASE = caseById('anaphylaxis-01');

describe('debrief chart data', () => {
  const run = runScript(
    LIBRARY,
    CASE,
    4,
    [
      { t: 20, action: { kind: 'talk', questionId: 'allergy' } },
      { t: 30, action: { kind: 'device', deviceId: 'o2_nrb', on: true } },
      imAdrenaline(65),
      { t: 70, action: { kind: 'procedure', procedureId: 'iv_access' } },
      { t: 80, action: { kind: 'drug', drugId: 'adrenaline', route: 'IV', dose: 1 } },
    ],
    { maxSec: min(8), stopOnOutcome: false },
  );
  const { points, markers, maxMin } = buildChartData(run.trace, run.events);

  it('marks treatments (not talk or exam) in order, numbered from 1', () => {
    expect(markers.map((m) => m.code)).toEqual([
      'device:o2_nrb:on',
      'drug:adrenaline:IM',
      'procedure:iv_access',
      'drug:adrenaline:IV',
      'adverse:iv_bolus_outside_arrest',
    ]);
    expect(markers.map((m) => m.n)).toEqual([1, 2, 3, 4, 5]);
    expect(markers.at(-1)?.harmful).toBe(true);
  });

  it('puts every marker on the same minute axis as the vitals, within one sample of a point', () => {
    for (const m of markers) {
      expect(m.min).toBeCloseTo(m.t / 60, 2);
      expect(m.min).toBeGreaterThanOrEqual(0);
      expect(m.min).toBeLessThanOrEqual(maxMin);
      const p = nearestPoint(points, m.t);
      expect(p).toBeDefined();
      expect(Math.abs((p?.t ?? Infinity) - m.t)).toBeLessThanOrEqual(7.5);
      expect(p?.min).toBeCloseTo((p?.t ?? 0) / 60, 2);
    }
    expect(points[0]?.min).toBe(0);
    expect(points.at(-1)?.t).toBe(min(8));
  });

  it('shows the BP surge from the IV bolus right after its marker', () => {
    const bolus = markers.find((m) => m.code === 'drug:adrenaline:IV')!;
    const before = nearestPoint(points, bolus.t - 15)!;
    const after = points.find((p) => p.t > bolus.t)!;
    expect((after.sbp ?? 0) - (before.sbp ?? 0)).toBeGreaterThan(30);
  });
});

describe('progress history', () => {
  beforeEach(() => clearProgress());

  it('tracks attempts, best and last score per case', () => {
    expect(getProgress('x')).toBeNull();
    recordAttempt('x', 60, 'ended');
    recordAttempt('x', 85, 'stabilised');
    const p = recordAttempt('x', 70, 'stabilised');
    expect(p).toMatchObject({ attempts: 3, best: 85, last: 70, lastOutcome: 'stabilised' });
    expect(getProgress('x')?.attempts).toBe(3);
    expect(getProgress('y')).toBeNull();
  });
});

describe('replay from minute', () => {
  it('resumes from a checkpoint with the earlier log intact and the same physiology', () => {
    const s = new Session(CASE, 9);
    s.start();
    s.act({ kind: 'device', deviceId: 'o2_nrb', on: true });
    for (let i = 0; i < 8 * 60; i++) s.advance(1);
    expect([...s.snapshots.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const r = Session.replay(s, 3);
    expect(r.t).toBe(s.snapshots.get(3)?.engine.t);
    expect(r.events.every((e) => e.t <= r.t)).toBe(true);
    expect(r.events.at(-1)?.code).toBe('replay');
    expect(r.events.some((e) => e.code === 'device:o2_nrb:on')).toBe(true);
    // Replaying with no new actions retraces the original run exactly.
    for (let i = r.t; i < 8 * 60; i++) r.advance(1);
    expect(r.engine.vitals()).toEqual(s.engine.vitals());
  });
});
