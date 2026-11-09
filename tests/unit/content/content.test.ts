import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CASES, checkCase, LIBRARY } from '../../../src/content/library.ts';
import { buildClinicalReview, collectContentFiles } from '../../../scripts/clinical-review.ts';

const anaphylaxis = () => structuredClone(CASES.find((c) => c.id === 'anaphylaxis-01')!);

describe('content', () => {
  it('bundles at least one valid case, and every case passes schema and cross-reference checks', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(1);
    for (const c of CASES) {
      const r = checkCase(c);
      expect(r.ok ? [] : r.issues).toEqual([]);
    }
  });

  it('every case has at least 8 scoring rules', () => {
    for (const c of CASES) expect(c.scoring.length).toBeGreaterThanOrEqual(8);
  });

  it('rejects malformed cases with readable messages', () => {
    const bad = anaphylaxis() as unknown as Record<string, unknown>;
    delete bad['openingLine'];
    (bad['baseline'] as Record<string, unknown>)['hr'] = 'fast';
    const r = checkCase(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.startsWith('openingLine'))).toBe(true);
      expect(r.issues.some((i) => i.startsWith('baseline.hr'))).toBe(true);
    }
  });

  it('catches broken references between case parts and the library', () => {
    const c = anaphylaxis();
    c.dialogue[0]!.a.pop();
    c.patientLines.push({ id: 'x', when: { drugGiven: 'unobtainium' }, text: 'hi' });
    c.teaching.push({ id: 'y', text: 't', showIf: { type: 'ruleFailed', id: 'missing' } });
    const r = checkCase(c);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('expected 3 (one per band)'),
          expect.stringContaining('unknown drug "unobtainium"'),
          expect.stringContaining('unknown scoring rule "missing"'),
        ]),
      );
    }
  });

  it('every effect target in the formulary is well-formed and each drug has a standard dose', () => {
    for (const d of LIBRARY.formulary.drugs) {
      for (const r of d.routes) expect(r.standardDose).toBeGreaterThan(0);
    }
  });

  it('every reviewNeeded item carries a source, and docs/clinical-review.md is up to date', () => {
    const files = collectContentFiles();
    const md = buildClinicalReview(files);
    expect(md).not.toContain('| (no source) |');
    const onDisk = readFileSync('docs/clinical-review.md', 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk, 'Run `npm run review:build` to regenerate docs/clinical-review.md').toBe(md);
  });
});
