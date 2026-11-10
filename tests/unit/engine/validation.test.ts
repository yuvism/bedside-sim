import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCES,
  runValidation,
  suggestTransitions,
} from '../../../src/engine/validation/compare.ts';
import {
  parseReferenceCsv,
  ReferenceCsvError,
  splitCsvLine,
} from '../../../src/engine/validation/csv.ts';
import { buildScript, parseEvent } from '../../../src/engine/validation/events.ts';
import {
  crossingTime,
  divergences,
  seriesMetrics,
  type Pair,
} from '../../../src/engine/validation/metrics.ts';
import { caseById, LIBRARY } from '../helpers.ts';

const ANA = caseById('anaphylaxis-01');
const SAMPLE = readFileSync('src/content/validation/anaphylaxis-01-sample.csv', 'utf8');

const pairs = (refs: number[], sims: number[]): Pair[] =>
  refs.map((ref, i) => ({ t: i * 10, ref, sim: sims[i] ?? 0 }));

describe('reference CSV', () => {
  it('splits quoted cells', () => {
    expect(splitCsvLine('1, "a, b" ,"say ""hi""",')).toEqual(['1', 'a, b', 'say "hi"', '']);
  });

  it('reads metadata, blanks, several events and sorts by time', () => {
    const ref = parseReferenceCsv(
      [
        '# case: anaphylaxis-01',
        '# Seed: 7',
        't_sec,hr,sbp,dbp,spo2,rr,etco2,event,notes',
        '30,100,,,95,20,NA,help; device:o2_nrb:on,x',
        '0,90,120,80,98,16,35,',
      ].join('\r\n'),
    );
    expect(ref.meta).toEqual({ case: 'anaphylaxis-01', seed: '7' });
    expect(ref.rows.map((r) => r.t)).toEqual([0, 30]);
    expect(ref.rows[1]?.values).toEqual({
      hr: 100,
      sbp: null,
      dbp: null,
      spo2: 95,
      rr: 20,
      etco2: null,
    });
    expect(ref.rows[1]?.events).toEqual(['help', 'device:o2_nrb:on']);
    expect(ref.warnings).toEqual(['Ignored columns: notes.']);
  });

  it('warns about bad cells and rejects files without times or rows', () => {
    const ref = parseReferenceCsv('t_sec,hr\n10,fast\nsoon,80\n20,85');
    expect(ref.rows.map((r) => r.values.hr)).toEqual([null, 85]);
    expect(ref.warnings).toHaveLength(2);
    expect(() => parseReferenceCsv('hr,sbp\n1,2')).toThrow(ReferenceCsvError);
    expect(() => parseReferenceCsv('t_sec,hr\n')).toThrow(/no data rows/);
    expect(() => parseReferenceCsv('')).toThrow(/empty/);
  });
});

describe('reference events', () => {
  const ev = (s: string) => parseEvent(s, LIBRARY, ANA);

  it('maps action ids, filling standard amounts', () => {
    expect(ev('drug:adrenaline:im')).toEqual({
      action: { kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 0.5 },
      code: 'drug:adrenaline:IM',
    });
    expect(ev('drug:adrenaline:IM:0.3')).toMatchObject({ action: { dose: 0.3 } });
    expect(ev('fluid:crystalloid:250')).toMatchObject({ action: { volumeMl: 250 } });
    expect(ev('device:o2_nrb:off')).toMatchObject({ code: 'device:o2_nrb:off' });
    expect(ev('infusion:adrenaline:stop')).toMatchObject({ action: { rate: 0 } });
    expect(ev('shock')).toMatchObject({ action: { kind: 'shock', joules: 150 } });
    expect(ev('talk:allergy')).toMatchObject({ code: 'talk:allergy' });
    expect(ev('cpr:on')).toMatchObject({ action: { kind: 'cpr', on: true } });
  });

  it('explains what it can’t replay', () => {
    expect(ev('drug:unicorn:IV')).toEqual({ note: 'Unknown drug "unicorn".' });
    expect(ev('drug:adrenaline:PO')).toMatchObject({ note: expect.stringMatching(/no route/) });
    expect(ev('talk:nonsense')).toMatchObject({ note: expect.stringMatching(/no question/) });
    expect(ev('drug:adrenaline:IM:lots')).toMatchObject({ note: expect.stringMatching(/Dose/) });
    expect(ev('Nurse arrives')).toEqual({ note: 'Annotation (free text, not replayed).' });
  });

  it('builds a script on sim time using the offset', () => {
    const ref = parseReferenceCsv('t_sec,event\n5,help\n60,drug:adrenaline:IM\n70,note');
    const { steps, events } = buildScript(ref, LIBRARY, ANA, -10);
    expect(steps).toEqual([
      {
        t: 50,
        action: { kind: 'drug', drugId: 'adrenaline', route: 'IM', dose: 0.5 },
      },
    ]);
    expect(events.map((e) => e.note ?? e.code)).toEqual([
      'Before the simulation starts (check the offset).',
      'drug:adrenaline:IM',
      'Annotation (free text, not replayed).',
    ]);
  });
});

describe('agreement metrics', () => {
  it('computes RMSE, MAE, bias, maximum deviation and share within tolerance', () => {
    const m = seriesMetrics(pairs([10, 20, 30], [12, 18, 33]), 2);
    expect(m.n).toBe(3);
    expect(m.rmse).toBeCloseTo(Math.sqrt(17 / 3), 10);
    expect(m.mae).toBeCloseTo(7 / 3, 10);
    expect(m.bias).toBeCloseTo(1, 10);
    expect(m.maxDev).toBe(3);
    expect(m.maxDevT).toBe(20);
    expect(m.withinTol).toBeCloseTo(2 / 3, 10);
    expect(m.flagged).toBe(true);
  });

  it('is exact for a perfect match and empty for no points', () => {
    const m = seriesMetrics(pairs([5, 6], [5, 6]), 0);
    expect(m).toMatchObject({ rmse: 0, mae: 0, bias: 0, maxDev: 0, withinTol: 1, flagged: false });
    expect(seriesMetrics([], 5)).toMatchObject({ n: 0, rmse: null, flagged: false });
  });

  it('groups consecutive points beyond tolerance into divergences', () => {
    const d = divergences(pairs([100, 100, 100, 100, 100, 100], [100, 115, 92, 101, 80, 85]), 5);
    expect(d).toEqual([
      { from: 10, to: 20, peakDev: 15, peakT: 10, simHigher: true },
      { from: 40, to: 50, peakDev: 20, peakT: 40, simHigher: false },
    ]);
  });

  it('finds threshold crossings with interpolation', () => {
    const s = [
      { t: 0, v: 80 },
      { t: 60, v: 85 },
      { t: 120, v: 95 },
      { t: 180, v: null },
      { t: 240, v: 110 },
    ];
    expect(crossingTime(s, 0, 'above', 90)).toBeCloseTo(90);
    expect(crossingTime(s, 100, 'above', 90)).toBeCloseTo(100);
    // Interpolates across the gap left by the missing reading at 180 s.
    expect(crossingTime(s, 130, 'above', 100)).toBeCloseTo(120 + ((100 - 95) / 15) * 120, 6);
    expect(crossingTime(s, 0, 'below', 82)).toBe(0);
    expect(crossingTime(s, 10, 'below', 70)).toBeNull();
    expect(crossingTime(s, 0, 'above', 200)).toBeNull();
  });
});

describe('video validation run', () => {
  const ref = parseReferenceCsv(SAMPLE);
  const transitions = suggestTransitions(buildScript(ref, LIBRARY, ANA).events);
  const run = () => runValidation(LIBRARY, ANA, ref, { seed: 1, transitions });

  it('loads the sample and replays its actions', () => {
    expect(ref.meta['case']).toBe('anaphylaxis-01');
    expect(ref.warnings).toEqual([]);
    const r = run();
    expect(r.events.filter((e) => e.action).map((e) => e.code)).toEqual([
      'help',
      'device:o2_nrb:on',
      'drug:adrenaline:IM',
      'procedure:iv_access',
      'fluid:crystalloid',
      'drug:adrenaline:IM',
    ]);
    expect(r.events.filter((e) => !e.action)).toHaveLength(3);
    expect(r.sim.at(-1)?.t).toBeGreaterThanOrEqual(900);
  });

  it('compares every observed vital and leaves unobserved ones empty', () => {
    const r = run();
    const by = Object.fromEntries(r.vitals.map((v) => [v.vital, v]));
    expect(by['hr']?.metrics.n).toBe(ref.rows.filter((x) => x.values.hr !== null).length);
    expect(by['sbp']?.metrics.n).toBe(11);
    expect(by['etco2']?.metrics.n).toBe(0);
    expect(by['spo2']?.metrics.tolerance).toBe(DEFAULT_TOLERANCES.spo2);
    // The synthetic reference starts with lower SpO2 than the sim: flagged.
    expect(by['spo2']?.divergences[0]?.from).toBe(0);
  });

  it('measures the lag from the first adrenaline dose to SBP above 90', () => {
    const [tr] = run().transitions;
    expect(tr).toMatchObject({ trigger: 'drug:adrenaline', vital: 'sbp', triggerT: 95 });
    expect(tr?.refT).toBeCloseTo(162, 6);
    expect(tr?.simT).not.toBeNull();
    expect(tr?.lagSec).toBeCloseTo((tr?.simT ?? 0) - 162, 6);
    expect(tr?.simDelay).toBeGreaterThan(tr?.refDelay ?? Infinity);
  });

  it('is deterministic for a seed', () => {
    expect(run().vitals).toEqual(run().vitals);
  });
});
