import { describe, expect, it } from 'vitest';
import { BOARD, bayOf, triageOf } from '../../../src/app/caseMeta.ts';
import { news2, type Obs } from '../../../src/app/news2.ts';
import { CASES } from '../../../src/content/library.ts';
import { caseById } from '../helpers.ts';

const NORMAL: Obs = { rr: 16, spo2: 98, sbp: 125, hr: 75, temp: 36.8, gcs: 15, onOxygen: false };

describe('NEWS2 (RCP 2017)', () => {
  it('scores normal observations as 0, low risk', () => {
    expect(news2(NORMAL, 30)).toMatchObject({ score: 0, risk: 'low', singleRed: false });
  });

  it('adds up each parameter and bands the total', () => {
    // RR 23 → 2, SpO2 97 → 0, SBP 88 → 3, HR 118 → 2, T 37 → 0 on air: 7, high.
    const r = news2({ ...NORMAL, rr: 23, spo2: 97, sbp: 88, hr: 118, temp: 37 }, 24);
    expect(r).toMatchObject({ score: 7, risk: 'high', singleRed: true });
    // Supplemental oxygen adds 2; 5–6 is medium.
    expect(news2({ ...NORMAL, hr: 115, onOxygen: true, spo2: 95 }, 50)).toMatchObject({
      score: 5,
      risk: 'medium',
    });
  });

  it('uses the published band edges', () => {
    const one = (o: Partial<Obs>) => news2({ ...NORMAL, ...o }, 40)?.score;
    expect(one({ temp: 38.0 })).toBe(0);
    expect(one({ temp: 38.1 })).toBe(1);
    expect(one({ temp: 39.1 })).toBe(2);
    expect(one({ temp: 35.0 })).toBe(3);
    expect(one({ hr: 130 })).toBe(2);
    expect(one({ hr: 131 })).toBe(3);
    expect(one({ hr: 40 })).toBe(3);
    expect(one({ rr: 24 })).toBe(2);
    expect(one({ rr: 25 })).toBe(3);
    expect(one({ rr: 8 })).toBe(3);
    expect(one({ sbp: 219 })).toBe(0);
    expect(one({ sbp: 220 })).toBe(3);
    expect(one({ sbp: 101 })).toBe(1);
    expect(one({ spo2: 91 })).toBe(3);
    expect(one({ spo2: 94 })).toBe(1);
  });

  it('flags a single red score and new confusion', () => {
    expect(news2({ ...NORMAL, gcs: 14 }, 70)).toMatchObject({
      score: 3,
      risk: 'low',
      singleRed: true,
    });
  });

  it('is not used under 16 and reports what could not be measured', () => {
    expect(news2(NORMAL, 15)).toBeNull();
    expect(news2({ ...NORMAL, spo2: null }, 30)?.missing).toEqual(['spo2']);
  });
});

describe('the department board', () => {
  it('puts every case in its own bay, 1 to 11', () => {
    const bays = CASES.map((c) => bayOf(c.id));
    expect(new Set(bays).size).toBe(CASES.length);
    expect(Math.min(...(bays as number[]))).toBe(1);
    expect(Math.max(...(bays as number[]))).toBe(CASES.length);
    expect(bayOf(BOARD[0]?.id ?? '')).toBe(1);
    expect(bayOf('a-draft')).toBeNull();
  });

  it('shows the varied patient and their observations on arrival', () => {
    const t = triageOf(caseById('anaphylaxis-01'), 1);
    expect(t.name).toBe('Arjun Mehta');
    expect(t.obs.hr).toBeGreaterThan(100);
    expect(t.obs.sbp).toBeLessThan(100);
    expect(t.news2?.risk).toBe('high');
    // The same seed always gives the same patient.
    expect(triageOf(caseById('anaphylaxis-01'), 1)).toEqual(t);
  });
});
