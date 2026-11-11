/**
 * Case facts for the case pages: the condition a case teaches (for "Learn by
 * topic") and an opaque patient code (for "Unknown patient", so the URL
 * doesn't give the diagnosis away).
 */
import { CASES } from '../content/library.ts';
import type { CaseDef } from '../engine/types.ts';
import { getProgress } from './progress.ts';
import { patientHref } from './router.ts';

export const DIFFICULTY = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' } as const;
export type Difficulty = keyof typeof DIFFICULTY;
export const LEVEL: Record<Difficulty, number> = { foundation: 1, core: 2, advanced: 3 };

/** The condition a case is about: the label of its (first) correct diagnosis. */
export function conditionOf(c: CaseDef): string {
  const id = c.diagnosis.correct[0];
  return c.diagnosis.options.find((o) => o.id === id)?.label ?? c.title;
}

/**
 * The one-line summary with the patient's age filled in. Seeded variation can
 * change the age, so an age written into the text ("A 45-year-old…") follows it.
 */
export const summaryOf = (c: CaseDef, age: number = c.patient.age): string =>
  c.summary.replaceAll('{age}', String(age)).replace(/\b\d{1,3}-year-old\b/, `${age}-year-old`);

/** A stable six-character code for a case id (FNV-1a, base 36). */
export function patientCode(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(-6);
}

export function caseByCode(code: string): CaseDef | null {
  return CASES.find((c) => patientCode(c.id) === code) ?? null;
}

/** A random patient, preferring ones this browser hasn't seen yet. */
export function surpriseHref(random: () => number = Math.random): string {
  const unseen = CASES.filter((c) => !getProgress(c.id));
  const pool = unseen.length > 0 ? unseen : CASES;
  const c = pool[Math.floor(random() * pool.length)] ?? CASES[0];
  return c ? patientHref(patientCode(c.id)) : '#/patients';
}

export function matchesQuery(fields: string[], q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || fields.some((x) => x.toLowerCase().includes(s));
}
