import { describe, expect, it } from 'vitest';
import { checkCase } from '../../../src/content/library.ts';
import { evaluate, fitCase, observedVitals } from '../../../src/engine/learning/fit.ts';
import { applyUpdate, proposeAdditions } from '../../../src/engine/learning/propose.ts';
import { listTunables } from '../../../src/engine/learning/tunables.ts';
import { runScript } from '../../../src/engine/replay.ts';
import { parseReferenceCsv, type Reference } from '../../../src/engine/validation/csv.ts';
import { buildScript } from '../../../src/engine/validation/events.ts';
import type { CaseDef } from '../../../src/engine/types.ts';
import { caseById, LIBRARY } from '../helpers.ts';

const ANA = caseById('anaphylaxis-01');
const EVENTS = [
  [30, 'help'],
  [60, 'device:o2_nrb:on'],
  [120, 'drug:adrenaline:IM'],
];

/** A synthetic "video": the case run with a known change, sampled like an annotation. */
function syntheticReference(truth: CaseDef): Reference {
  const script = EVENTS.map(([t, code]) => {
    const ref = parseReferenceCsv(`t_sec,event\n${t},${code}`);
    return buildScript(ref, LIBRARY, truth).steps[0];
  }).filter((s) => s !== undefined);
  const run = runScript(LIBRARY, truth, 1, script, {
    maxSec: 420,
    stopOnOutcome: false,
    sampleEverySec: 1,
  });
  const at = new Map(run.trace.map((r) => [r.t, r]));
  const lines = ['t_sec,hr,sbp,dbp,spo2,rr,etco2,event'];
  for (let t = 0; t <= 420; t += 30) {
    const r = at.get(t);
    const ev = EVENTS.find(([et]) => et === t)?.[1] ?? '';
    lines.push(
      [t, r?.hr ?? '', r?.sbp ?? '', r?.dbp ?? '', r?.spo2 ?? '', r?.rr ?? '', '', ev].join(','),
    );
  }
  return parseReferenceCsv(lines.join('\n'));
}

describe('learn from a video: update', () => {
  it('lists bounded tunables for the vitals the video shows', () => {
    const t = listTunables(ANA, ['hr', 'sbp']);
    expect(t.map((x) => x.id)).toContain('anaphylaxis.initial');
    expect(t.some((x) => x.id.startsWith('anaphylaxis.effect.'))).toBe(true);
    for (const x of t) expect(x.min).toBeLessThanOrEqual(x.max);
  });

  it('moves a mis-set starting severity back towards the truth', () => {
    const truth = structuredClone(ANA);
    const p = truth.processes[0];
    if (!p) throw new Error('no process');
    p.initial = 58;
    p.initialJitter = 0;
    const ref = syntheticReference(truth);
    expect(observedVitals(ref)).toEqual(['hr', 'sbp', 'dbp', 'spo2', 'rr']);

    const start = structuredClone(ANA);
    if (start.processes[0]) start.processes[0].initialJitter = 0;
    const fit = fitCase(LIBRARY, start, ref, { seed: 1, maxEvals: 60 });
    expect(fit.scoreAfter).toBeLessThan(fit.scoreBefore * 0.5);
    const initial = fit.changes.find((c) => c.tunable.id === 'anaphylaxis.initial');
    expect(initial?.after ?? 0).toBeGreaterThan(48);
    expect(evaluate(LIBRARY, fit.caseAfter, ref, { seed: 1 }).score).toBeCloseTo(fit.scoreAfter, 9);
  });
});

describe('learn from a video: add what is missing', () => {
  const ref = parseReferenceCsv(
    [
      't_sec,hr,event',
      '0,120,',
      '20,121,help',
      '40,124,order:vbg',
      '60,125,drug:magnesium_sulfate:IV',
      '80,124,procedure:ecmo',
      '90,123,Team decides bag-mask is failing',
      '100,122,"Patient says: I can breathe a bit better"',
    ].join('\n'),
  );
  const events = buildScript(ref, LIBRARY, ANA).events;
  const adds = proposeAdditions({
    lib: LIBRARY,
    caseDef: ANA,
    events,
    severityAt: () => 60,
    referenceName: 'test video',
  });
  const kinds = (k: string) => adds.filter((a) => a.kind === k);

  it('credits actions the video team did that the case never scores', () => {
    const ids = kinds('scoring').map((a) => a.id);
    expect(ids).toContain('video-drug-magnesium-sulfate');
    expect(ids).toContain('video-order-vbg');
    // Calling for help is already credited by the case.
    expect(ids).not.toContain('video-help');
  });

  it('adds a missing result, a hint, a patient line and reports library gaps', () => {
    expect(kinds('investigation').map((a) => a.id)).toEqual(['inv:vbg']);
    const hint = kinds('hint')[0];
    expect(hint?.kind === 'hint' && hint.hint.text).toBe('Team decides bag-mask is failing');
    expect(hint?.kind === 'hint' && hint.hint.when).toEqual({ severity: 'anaphylaxis', gte: 58 });
    const line = kinds('patientLine')[0];
    expect(line?.kind === 'patientLine' && line.line.text).toBe('I can breathe a bit better');
    const lib = kinds('library')[0];
    expect(lib?.kind === 'library' && lib.because).toMatch(/Unknown procedure "ecmo"/);
  });

  it('applies approved changes into a new, valid case flagged for review', () => {
    const tun = listTunables(ANA, ['hr'])[0];
    if (!tun) throw new Error('no tunable');
    const updated = applyUpdate({
      base: ANA,
      changes: [{ tunable: tun, before: tun.value, after: 61.23456 }],
      additions: adds.filter((a) => a.kind !== 'library'),
      newId: 'anaphylaxis-video',
      newTitle: 'Collapse after lunch (from video)',
      referenceName: 'test video',
      date: '2026-11-11',
    });
    expect(updated.id).toBe('anaphylaxis-video');
    expect(updated.processes[0]?.initial).toBe(61.23);
    expect(updated.processes[0]?.reviewNeeded).toBe(true);
    expect(updated.processes[0]?.source).toMatch(/Fitted to "test video" on 2026-11-11/);
    expect(updated.scoring.length).toBe(ANA.scoring.length + kinds('scoring').length);
    expect(ANA.processes[0]?.initial).not.toBe(61.23);
    const check = checkCase(updated);
    expect(check.ok ? [] : check.issues).toEqual([]);
  });
});
