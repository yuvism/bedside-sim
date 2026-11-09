import { describe, expect, it } from 'vitest';
import { parseHash } from '../../../src/app/router.ts';
import { NIBP_CYCLE_SEC, Session } from '../../../src/app/session.ts';
import type { Vitals } from '../../../src/engine/types.ts';
import { evaluateAlarms, spo2ToFrequency, topPriority } from '../../../src/ui/monitor/alarms.ts';
import { capnoShape, ecgBeat, plethShape } from '../../../src/ui/monitor/shapes.ts';
import { caseById } from '../helpers.ts';

const V: Vitals = {
  hr: 80,
  sbp: 120,
  dbp: 70,
  map: 87,
  spo2: 98,
  rr: 14,
  etco2: 36,
  temp: 37,
  gcs: 15,
  glucose: 5,
  rhythm: 'sinus',
  ectopy: false,
};
const nibp = (sbp: number) => ({ sbp, dbp: 50, map: 60, t: 0 });

describe('monitor alarms', () => {
  it('is quiet for normal vitals', () => {
    expect(evaluateAlarms({ vitals: V, nibp: nibp(120), artLine: false })).toEqual([]);
  });

  it('grades medium and high priority, high first', () => {
    const a = evaluateAlarms({
      vitals: { ...V, hr: 130, spo2: 80 },
      nibp: nibp(120),
      artLine: false,
    });
    expect(a.map((x) => [x.key, x.priority])).toEqual([
      ['spo2', 'high'],
      ['hr', 'medium'],
    ]);
    expect(topPriority(a)).toBe('high');
  });

  it('uses the cuff reading for BP unless an arterial line is in', () => {
    const v = { ...V, sbp: 60 };
    expect(evaluateAlarms({ vitals: v, nibp: nibp(120), artLine: false })).toEqual([]);
    expect(evaluateAlarms({ vitals: v, nibp: nibp(120), artLine: true })[0]?.message).toBe(
      'SBP 60 LOW',
    );
  });

  it('raises a rhythm alarm in VF and loses the pulse oximeter in PEA', () => {
    const vf = { ...V, rhythm: 'vf' as const, hr: null, sbp: null, spo2: null };
    expect(evaluateAlarms({ vitals: vf, nibp: null, artLine: false })[0]?.message).toBe('VFIB');
    const pea = { ...V, rhythm: 'pea' as const, sbp: null, spo2: null };
    expect(evaluateAlarms({ vitals: pea, nibp: null, artLine: false })[0]?.message).toBe(
      'SpO₂ NO PULSE',
    );
  });

  it('lowers the beep pitch as saturation falls', () => {
    expect(spo2ToFrequency(100)).toBeCloseTo(880, 6);
    expect(spo2ToFrequency(85)).toBeLessThan(spo2ToFrequency(95));
  });
});

describe('waveform shapes', () => {
  it('peaks at the R wave, pleth lags, capnogram plateaus in expiration', () => {
    expect(ecgBeat(0.31)).toBeGreaterThan(0.9);
    expect(Math.abs(ecgBeat(0.05))).toBeLessThan(0.05);
    expect(plethShape(0.51)).toBeGreaterThan(0.9);
    expect(capnoShape(0.1)).toBe(0);
    expect(capnoShape(0.8)).toBeGreaterThan(0.9);
    expect(capnoShape(0.45, 1)).toBeLessThan(capnoShape(0.45, 0));
  });
});

describe('router', () => {
  it('parses case routes and seeds', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/case/anaphylaxis-01?seed=42')).toEqual({
      name: 'case',
      caseId: 'anaphylaxis-01',
      seed: 42,
    });
    expect(parseHash('#/case/x?seed=abc')).toEqual({ name: 'case', caseId: 'x', seed: null });
  });
});

describe('session', () => {
  it('opens with the patient’s first line and a cuff reading, then cycles NIBP', () => {
    const s = new Session(caseById('anaphylaxis-01'), 1, undefined, {
      nurse: false,
      variation: false,
    });
    s.start();
    expect(s.bubble?.text).toMatch(/^Doctor/);
    expect(s.nibp?.t).toBe(0);
    s.advance(NIBP_CYCLE_SEC);
    expect(s.nibp?.t).toBe(NIBP_CYCLE_SEC);
    expect(s.events.some((e) => e.code === 'monitor:nibp')).toBe(false);
    s.measureNibp(true);
    expect(s.events.at(-1)?.code).toBe('monitor:nibp');
  });

  it('collects results into an inbox and tracks unread', () => {
    const s = new Session(caseById('anaphylaxis-01'), 1, undefined, {
      nurse: false,
      variation: false,
    });
    s.start();
    s.act({ kind: 'order', investigationId: 'glu' });
    s.act({ kind: 'order', investigationId: 'abg' });
    expect(s.unread).toBe(1);
    s.advance(150);
    expect(s.results.map((r) => r.investigationId)).toEqual(['abg', 'glu']);
    expect(s.results[1]?.text).toBe('Glucose 5.8 mmol/L.');
    s.markRead('abg');
    expect(s.unread).toBe(1);
    s.markRead();
    expect(s.unread).toBe(0);
  });

  it('shows the latest patient words in the bubble', () => {
    const s = new Session(caseById('anaphylaxis-01'), 1, undefined, {
      nurse: false,
      variation: false,
    });
    s.start();
    s.act({ kind: 'talk', questionId: 'allergy' });
    expect(s.bubble?.text).toBe('I’m allergic to peanuts. They told me there weren’t any.');
  });
});
