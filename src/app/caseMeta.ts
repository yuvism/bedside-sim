/**
 * Case facts for the case pages: the condition a case teaches (for "Learn by
 * topic") and an opaque patient code (for "Unknown patient", so the URL
 * doesn't give the diagnosis away).
 */
import { CASES, LIBRARY } from '../content/library.ts';
import { SimpleEngine } from '../engine/engine.ts';
import type { CaseDef } from '../engine/types.ts';
import { materialiseCase } from '../engine/variation.ts';
import { news2, type News2Result, type Obs } from './news2.ts';
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

/** The department board, in bay order. Ordered by code so it doesn't mirror the topic list. */
export const BOARD: readonly CaseDef[] = [...CASES].sort((a, b) =>
  patientCode(a.id).localeCompare(patientCode(b.id)),
);

/**
 * The bed space a case's patient is in. The same in both ways to practise:
 * on the board, above the bed and in the bedside header. Null for drafts.
 */
export function bayOf(caseId: string): number | null {
  const i = BOARD.findIndex((c) => c.id === caseId);
  return i < 0 ? null : i + 1;
}

export interface Triage {
  name: string;
  age: number;
  sex: string;
  obs: Obs;
  /** Diastolic BP on arrival (NEWS2 doesn't use it, but the board shows it). */
  dbp: number | null;
  news2: News2Result | null;
}

/** The varied patient for this seed and their observations on arrival, with NEWS2. */
export function triageOf(c: CaseDef, seed: number): Triage {
  const m = materialiseCase(c, seed).caseDef;
  const engine = new SimpleEngine(LIBRARY);
  engine.load(m, seed);
  const v = engine.vitals();
  const devices = engine.status().devices;
  const obs: Obs = {
    rr: v.rr,
    spo2: v.spo2,
    sbp: v.sbp,
    hr: v.hr,
    temp: v.temp,
    gcs: v.gcs,
    onOxygen: devices.some((d) => d.startsWith('o2_') || d === 'bvm'),
  };
  return {
    name: m.patient.name,
    age: m.patient.age,
    sex: m.patient.sex,
    obs,
    dbp: v.dbp,
    news2: news2(obs, m.patient.age),
  };
}
