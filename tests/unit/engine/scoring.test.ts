import { describe, expect, it } from 'vitest';
import type { ScoringRule } from '../../../src/engine/caseTypes.ts';
import { runScript } from '../../../src/engine/replay.ts';
import {
  codeMatches,
  CRITICAL_CAP,
  lastDiagnosis,
  scoreRun,
  type RunRecord,
} from '../../../src/engine/scoring.ts';
import type { TraceRow } from '../../../src/engine/recorder.ts';
import type { SimEvent } from '../../../src/engine/types.ts';
import { caseById, imAdrenaline, LIBRARY, min } from '../helpers.ts';

const ev = (t: number, code: string): SimEvent => ({ t, type: 'action', code, text: code });
const row = (t: number, sbp: number | null, spo2: number | null = 98): TraceRow => ({
  t,
  hr: 100,
  sbp,
  dbp: sbp === null ? null : sbp * 0.6,
  map: null,
  spo2,
  rr: 16,
  etco2: 35,
  temp: 37,
  gcs: 15,
  rhythm: 'sinus',
});
const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  events: [],
  trace: [row(0, 120)],
  outcome: 'ended',
  diagnosis: null,
  ...over,
});
const rule = (id: string, test: ScoringRule['test'], extra: Partial<ScoringRule> = {}) =>
  ({ id, label: id, weight: 10, kind: 'credit', test, ...extra }) as ScoringRule;
const one = (r: ScoringRule, rec: RunRecord) =>
  scoreRun({ scoring: [r], teaching: [] }, rec).results[0]!;

describe('scoring rule types', () => {
  it('matches codes with * wildcards', () => {
    expect(codeMatches('drug:adrenaline:IM', 'drug:adrenaline:IM')).toBe(true);
    expect(codeMatches('drug:*:IV', 'drug:adrenaline:IV')).toBe(true);
    expect(codeMatches('drug:*:IV', 'drug:adrenaline:IM')).toBe(false);
    expect(codeMatches('a.b', 'axb')).toBe(false);
  });

  it('actionDone / actionWithin / actionNever / actionCount', () => {
    const rec = run({ events: [ev(30, 'help'), ev(200, 'drug:x:IM'), ev(400, 'drug:x:IM')] });
    expect(one(rule('a', { type: 'actionDone', codes: ['help'] }), rec).passed).toBe(true);
    const within = one(
      rule('b', { type: 'actionWithin', codes: ['drug:x:*'], withinSec: 180 }),
      rec,
    );
    expect(within.passed).toBe(false);
    expect(within.firstT).toBe(200);
    expect(one(rule('c', { type: 'actionNever', codes: ['drug:y:*'] }), rec).passed).toBe(true);
    const count = one(rule('d', { type: 'actionCount', codes: ['drug:x:IM'], min: 2 }), rec);
    expect(count.passed).toBe(true);
    expect(count.detail).toBe('2');
  });

  it('actionBefore uses event order and passes when the other action never happens', () => {
    const t: ScoringRule['test'] = { type: 'actionBefore', codes: ['a'], before: ['b'] };
    expect(one(rule('x', t), run({ events: [ev(5, 'a'), ev(5, 'b')] })).passed).toBe(true);
    expect(one(rule('x', t), run({ events: [ev(5, 'b'), ev(5, 'a')] })).passed).toBe(false);
    expect(one(rule('x', t), run({ events: [ev(5, 'a')] })).passed).toBe(true);
    expect(one(rule('x', t), run({ events: [ev(5, 'b')] })).passed).toBe(false);
  });

  it('examined / asked count distinct ids, with an optional minimum', () => {
    const rec = run({
      events: [ev(1, 'exam:A'), ev(2, 'exam:B'), ev(3, 'exam:A'), ev(4, 'talk:q')],
    });
    const all = one(rule('e', { type: 'examined', ids: ['A', 'B', 'C'] }), rec);
    expect(all.passed).toBe(false);
    expect(all.detail).toBe('2/3');
    expect(one(rule('e', { type: 'examined', ids: ['A', 'B', 'C'], min: 2 }), rec).passed).toBe(
      true,
    );
    expect(one(rule('q', { type: 'asked', ids: ['q'] }), rec).passed).toBe(true);
  });

  it('diagnosisIs, outcomeIs and vital thresholds', () => {
    expect(
      one(rule('d', { type: 'diagnosisIs', ids: ['x'] }), run({ diagnosis: 'x' })).passed,
    ).toBe(true);
    expect(one(rule('o', { type: 'outcomeIs', outcomes: ['stabilised'] }), run()).passed).toBe(
      false,
    );
    const trace = [row(0, 120), row(15, 85), row(30, 110)];
    expect(
      one(rule('v', { type: 'vitalNeverBelow', vital: 'sbp', value: 90 }), run({ trace })).passed,
    ).toBe(false);
    expect(
      one(rule('v', { type: 'vitalNeverAbove', vital: 'sbp', value: 130 }), run({ trace })).passed,
    ).toBe(true);
    const arrest = [row(0, 120), row(15, null)];
    expect(
      one(rule('v', { type: 'vitalNeverBelow', vital: 'sbp', value: 50 }), run({ trace: arrest }))
        .passed,
    ).toBe(false);
  });

  it('composes rules with rulePassed/ruleFailed/all/any/not', () => {
    const rules: ScoringRule[] = [
      rule('given', { type: 'actionDone', codes: ['a'] }),
      rule('late', {
        type: 'all',
        tests: [
          { type: 'rulePassed', id: 'given' },
          { type: 'not', test: { type: 'actionWithin', codes: ['a'], withinSec: 60 } },
        ],
      }),
    ];
    const res = scoreRun({ scoring: rules, teaching: [] }, run({ events: [ev(100, 'a')] }));
    expect(res.results.map((r) => r.passed)).toEqual([true, true]);
  });
});

describe('scoring totals', () => {
  const rules: ScoringRule[] = [
    rule('a', { type: 'actionDone', codes: ['a'] }, { weight: 60 }),
    rule('b', { type: 'actionDone', codes: ['b'] }, { weight: 40, critical: true }),
    rule('harm', { type: 'actionNever', codes: ['bad'] }, { weight: 20, kind: 'penalty' }),
  ];

  it('adds credits, subtracts penalties and floors at zero', () => {
    const all = scoreRun(
      { scoring: rules, teaching: [] },
      run({ events: [ev(1, 'a'), ev(1, 'b')] }),
    );
    expect(all.percent).toBe(100);
    expect(all.results.map((r) => r.status)).toEqual(['done', 'done', 'avoided']);
    const harm = scoreRun(
      { scoring: rules, teaching: [] },
      run({ events: [ev(1, 'a'), ev(1, 'b'), ev(2, 'bad')] }),
    );
    expect(harm.percent).toBe(80);
    expect(harm.results[2]?.status).toBe('harmful');
    const none = scoreRun({ scoring: rules, teaching: [] }, run({ events: [ev(2, 'bad')] }));
    expect(none.percent).toBe(0);
  });

  it('caps the score when a critical rule fails', () => {
    const r = scoreRun({ scoring: rules, teaching: [] }, run({ events: [ev(1, 'a')] }));
    expect(r.raw).toBe(60);
    expect(r.percent).toBe(CRITICAL_CAP);
    expect(r.capped).toBe(true);
  });

  it('shows teaching points by condition', () => {
    const teaching = [
      { id: 't1', text: 'always' },
      { id: 't2', text: 'missed b', showIf: { type: 'ruleFailed', id: 'b' } as const },
    ];
    const r = scoreRun({ scoring: rules, teaching }, run({ events: [ev(1, 'b')] }));
    expect(r.teaching.map((t) => t.id)).toEqual(['t1']);
  });

  it('reads the last working diagnosis', () => {
    expect(lastDiagnosis([ev(1, 'dx:a'), ev(2, 'help'), ev(3, 'dx:b')])).toBe('b');
    expect(lastDiagnosis([])).toBeNull();
  });
});

describe('anaphylaxis-01 scoring end to end', () => {
  const c = caseById('anaphylaxis-01');

  it('scores an ideal run highly and a do-nothing run at zero', () => {
    const ideal = runScript(
      LIBRARY,
      c,
      1,
      [
        { t: 5, action: { kind: 'call_help' } },
        { t: 10, action: { kind: 'talk', questionId: 'allergy' } },
        ...['A', 'B', 'C', 'D', 'E'].map((id, i) => ({
          t: 15 + i * 5,
          action: { kind: 'exam' as const, examId: id },
        })),
        { t: 45, action: { kind: 'device', deviceId: 'o2_nrb', on: true } },
        imAdrenaline(60),
        { t: 70, action: { kind: 'procedure', procedureId: 'iv_access' } },
        { t: 80, action: { kind: 'fluid', fluidId: 'crystalloid', volumeMl: 500 } },
        { t: 90, action: { kind: 'diagnosis', diagnosisId: 'anaphylaxis' } },
        imAdrenaline(min(6)),
      ],
      { maxSec: min(30) },
    );
    const s = scoreRun(c, {
      events: ideal.events,
      trace: ideal.trace,
      outcome: ideal.outcome ?? 'ended',
      diagnosis: lastDiagnosis(ideal.events),
    });
    expect(ideal.outcome).toBe('stabilised');
    expect(s.percent).toBe(100);
    expect(s.teaching.map((t) => t.id)).toEqual([]);

    const idle = runScript(LIBRARY, c, 1, [], { maxSec: min(45) });
    expect(idle.outcome).toBe('died');
    const z = scoreRun(c, {
      events: idle.events,
      trace: idle.trace,
      outcome: 'died',
      diagnosis: null,
    });
    expect(z.percent).toBe(0);
    expect(z.teaching.map((t) => t.id)).toContain('no-adrenaline');
  });
});
