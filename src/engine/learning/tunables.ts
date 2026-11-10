/**
 * The case parameters that "Learn from a video" may adjust: process starting
 * severity, rates, drive decay, treatment strengths, the per-point effects
 * on the vitals the video shows, and the baseline. Each has bounds so a fit
 * can't wander into nonsense.
 */
import type { CaseDef } from '../caseTypes.ts';
import type { RefVital } from '../validation/csv.ts';

export type Path = (string | number)[];

export interface Tunable {
  id: string;
  label: string;
  path: Path;
  value: number;
  min: number;
  max: number;
  /** "mul": searched as a factor (keeps the sign); "add": searched in steps. */
  scale: 'mul' | 'add';
}

/** Effect targets that move each observed vital. */
const TARGETS_FOR: Record<RefVital, string[]> = {
  hr: ['hr'],
  sbp: ['sbp'],
  dbp: ['dbp', 'sbp'],
  spo2: ['vq', 'shunt'],
  rr: ['rr'],
  etco2: ['ventLoss', 'etco2'],
};

export const MAX_TUNABLES = 18;

export function getAt(obj: unknown, path: Path): unknown {
  let cur = obj;
  for (const p of path) cur = (cur as Record<string | number, unknown>)[p];
  return cur;
}

export function setAt(obj: unknown, path: Path, value: number): void {
  let cur = obj as Record<string | number, unknown>;
  for (const p of path.slice(0, -1)) cur = cur[p] as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (last !== undefined) cur[last] = value;
}

const mul = (id: string, label: string, path: Path, value: number, lo = 0.25, hi = 4): Tunable => ({
  id,
  label,
  path,
  value,
  min: value * (value >= 0 ? lo : hi),
  max: value * (value >= 0 ? hi : lo),
  scale: 'mul',
});

export function listTunables(c: CaseDef, observed: readonly RefVital[]): Tunable[] {
  const out: Tunable[] = [];
  const targets = new Set(observed.flatMap((v) => TARGETS_FOR[v]));
  c.processes.forEach((p, i) => {
    out.push({
      id: `${p.id}.initial`,
      label: `${p.label}: starting severity`,
      path: ['processes', i, 'initial'],
      value: p.initial,
      min: 0,
      max: 100,
      scale: 'add',
    });
    if (p.ratePerMin !== 0) {
      out.push(
        mul(
          `${p.id}.ratePerMin`,
          `${p.label}: rate per minute`,
          ['processes', i, 'ratePerMin'],
          p.ratePerMin,
        ),
      );
    }
    if (p.decayTauMin) {
      out.push(
        mul(
          `${p.id}.decayTauMin`,
          `${p.label}: drive decay (min)`,
          ['processes', i, 'decayTauMin'],
          p.decayTauMin,
        ),
      );
    }
    (p.treatments ?? []).forEach((t, k) => {
      out.push(
        mul(
          `${p.id}.treatment.${t.id}`,
          `${p.label}: treatment "${t.id}" rate`,
          ['processes', i, 'treatments', k, 'ratePerMin'],
          t.ratePerMin,
        ),
      );
    });
    p.effects.forEach((e, j) => {
      if (!targets.has(e.target)) return;
      const where = e.above ? ` above ${e.above}` : '';
      out.push(
        mul(
          `${p.id}.effect.${j}`,
          `${p.label}: ${e.target} per point${where}`,
          ['processes', i, 'effects', j, 'perPoint'],
          e.perPoint,
        ),
      );
    });
  });
  for (const k of ['hr', 'sbp', 'rr'] as const) {
    out.push(
      mul(`baseline.${k}`, `Baseline ${k.toUpperCase()}`, ['baseline', k], c.baseline[k], 0.7, 1.3),
    );
  }
  return out.slice(0, MAX_TUNABLES);
}
