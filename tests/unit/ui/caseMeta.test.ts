import { describe, expect, it } from 'vitest';
import {
  caseByCode,
  conditionOf,
  patientCode,
  summaryOf,
  surpriseHref,
} from '../../../src/app/caseMeta.ts';
import { parseHash, patientHref } from '../../../src/app/router.ts';
import { CASES } from '../../../src/content/library.ts';
import { caseById } from '../helpers.ts';

describe('case pages', () => {
  it('names each topic by its correct diagnosis', () => {
    expect(conditionOf(caseById('anaphylaxis-01'))).toBe('Anaphylaxis');
    expect(conditionOf(caseById('dka-01'))).toBe('Diabetic ketoacidosis');
  });

  it('gives every case a unique opaque patient code that maps back', () => {
    const codes = CASES.map((c) => patientCode(c.id));
    expect(new Set(codes).size).toBe(CASES.length);
    for (const [i, code] of codes.entries()) {
      expect(code).toMatch(/^[0-9a-z]{6}$/);
      // The code must not give the case (and so the diagnosis) away.
      expect(CASES[i]?.id).not.toContain(code);
      expect(caseByCode(code)?.id).toBe(CASES[i]?.id);
    }
    expect(caseByCode('nope00')).toBeNull();
  });

  it('keeps an age written into the summary in step with the varied patient', () => {
    const c = caseById('haemorrhage-01');
    expect(summaryOf(c)).toMatch(new RegExp(`^A ${c.patient.age}-year-old`));
    expect(summaryOf(c, 51)).toMatch(/^A 51-year-old/);
  });

  it('routes unknown patients and the new pages', () => {
    expect(parseHash('#/patient/abc123?seed=7')).toEqual({
      name: 'patient',
      code: 'abc123',
      seed: 7,
    });
    expect(parseHash('#/patient/abc123')).toEqual({ name: 'patient', code: 'abc123', seed: null });
    for (const name of ['topics', 'patients', 'how', 'teach'] as const) {
      expect(parseHash(`#/${name}`)).toEqual({ name });
    }
    expect(patientHref('abc123', 7)).toBe('#/patient/abc123?seed=7');
  });

  it('picks a random patient by code, never by case id', () => {
    const href = surpriseHref(() => 0);
    const r = parseHash(href);
    expect(r.name).toBe('patient');
    if (r.name === 'patient') expect(caseByCode(r.code)).not.toBeNull();
    expect(CASES.some((c) => href.includes(c.id))).toBe(false);
  });
});
