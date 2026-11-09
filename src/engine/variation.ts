/**
 * Seeded case variation: a pure function from (case, seed) to a concrete
 * patient. Age, weight, allergies, comorbidities, starting severity and
 * which question reveals the key clue can all vary, and the same seed always
 * gives the same patient.
 */
import type { CaseDef, VariationOption } from './caseTypes.ts';
import { Rng, seedToState } from './rng.ts';

export interface Materialised {
  caseDef: CaseDef;
  /** Variation options that applied, for the brief and the debrief. */
  applied: VariationOption[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function materialiseCase(c: CaseDef, seed: number): Materialised {
  const v = c.variation;
  if (!v) return { caseDef: c, applied: [] };
  const rng = new Rng(seedToState(seed ^ 0x76617279));
  const out: CaseDef = JSON.parse(JSON.stringify(c)) as CaseDef;
  if (v.ageRange) out.patient.age = Math.round(rng.uniform(v.ageRange[0], v.ageRange[1]));
  if (v.weightKgRange) {
    out.patient.weightKg = round1(rng.uniform(v.weightKgRange[0], v.weightKgRange[1]));
  }
  const applied: VariationOption[] = [];
  for (const opt of v.options ?? []) {
    if (!rng.chance(opt.chance)) continue;
    applied.push(opt);
    if (opt.allergies?.length) {
      out.patient.allergies = [...new Set([...(out.patient.allergies ?? []), ...opt.allergies])];
    }
    for (const [qid, answers] of Object.entries(opt.answers ?? {})) {
      const d = out.dialogue.find((x) => x.id === qid);
      if (d) d.a = [...answers];
    }
    const b = opt.baseline ?? {};
    out.baseline.hr += b.hr ?? 0;
    out.baseline.sbp += b.sbp ?? 0;
    out.baseline.rr += b.rr ?? 0;
    out.baseline.temp += b.temp ?? 0;
    if (opt.severity) {
      for (const p of out.processes)
        p.initial = Math.max(0, Math.min(99, p.initial + opt.severity));
    }
  }
  return { caseDef: out, applied };
}
