/**
 * "Update itself": adjusts a case's tunable parameters so the simulated
 * vitals follow a reference timeline (from a video) as closely as possible.
 * Deterministic pattern search over the bounded tunables; every evaluation
 * replays the reference's actions through the engine with the same seed.
 */
import type { CaseDef } from '../caseTypes.ts';
import type { EngineLibrary } from '../types.ts';
import { SimpleEngine } from '../engine.ts';
import { runScript } from '../replay.ts';
import { DEFAULT_TOLERANCES, runValidation } from '../validation/compare.ts';
import { buildScript } from '../validation/events.ts';
import { REF_VITALS, type Reference, type RefVital } from '../validation/csv.ts';
import { getAt, listTunables, setAt, type Tunable } from './tunables.ts';

export interface FitOptions {
  seed: number;
  offsetSec?: number;
  tolerances?: Partial<Record<RefVital, number>>;
  /** Engine runs allowed (each replays the whole reference). */
  maxEvals?: number;
}

export interface ParamChange {
  tunable: Tunable;
  before: number;
  after: number;
}

export interface FitProgress {
  evals: number;
  maxEvals: number;
  score: number;
}

export interface FitResult {
  caseAfter: CaseDef;
  changes: ParamChange[];
  /** Mean squared error in tolerance units (1 = typically one tolerance off). */
  scoreBefore: number;
  scoreAfter: number;
  rmseBefore: Partial<Record<RefVital, number>>;
  rmseAfter: Partial<Record<RefVital, number>>;
  evals: number;
}

/** A missing sim value where the video has one counts as this many tolerances off. */
const MISSING_PENALTY = 5;

export function observedVitals(ref: Reference): RefVital[] {
  return REF_VITALS.filter((v) => ref.rows.some((r) => r.values[v] !== null));
}

export function evaluate(
  lib: EngineLibrary,
  c: CaseDef,
  ref: Reference,
  opts: FitOptions,
): { score: number; rmse: Partial<Record<RefVital, number>> } {
  const tol = { ...DEFAULT_TOLERANCES, ...opts.tolerances };
  const r = runValidation(lib, c, ref, {
    seed: opts.seed,
    offsetSec: opts.offsetSec ?? 0,
    tolerances: tol,
  });
  const simAt = new Map(r.sim.map((s) => [Math.round(s.t), s]));
  let sum = 0;
  let n = 0;
  const rmse: Partial<Record<RefVital, number>> = {};
  for (const v of REF_VITALS) {
    let sq = 0;
    let k = 0;
    for (const row of ref.rows) {
      const want = row.values[v];
      if (want === null) continue;
      const got = simAt.get(Math.round(row.t))?.[v];
      if (got === null || got === undefined) {
        sum += MISSING_PENALTY * MISSING_PENALTY;
        n++;
        continue;
      }
      const d = got - want;
      sq += d * d;
      k++;
      sum += (d / tol[v]) ** 2;
      n++;
    }
    if (k) rmse[v] = Math.sqrt(sq / k);
  }
  return { score: n ? sum / n : 0, rmse };
}

function candidate(t: Tunable, current: number, step: number, dir: 1 | -1): number {
  const next =
    t.scale === 'mul' ? current * Math.exp(dir * step) : current + dir * step * (t.max - t.min);
  return Math.min(t.max, Math.max(t.min, next));
}

/** Runs the fit one engine evaluation at a time, so a UI can show progress. */
export function* fitSteps(
  lib: EngineLibrary,
  original: CaseDef,
  ref: Reference,
  opts: FitOptions,
): Generator<FitProgress, FitResult, void> {
  const maxEvals = opts.maxEvals ?? 160;
  const work = structuredClone(original);
  const tunables = listTunables(original, observedVitals(ref));
  const first = evaluate(lib, work, ref, opts);
  let best = first.score;
  let evals = 1;
  const steps: number[] = tunables.map((t) => (t.scale === 'mul' ? 0.5 : 0.08));
  yield { evals, maxEvals, score: best };

  while (evals < maxEvals && steps.some((s) => s > 0.01)) {
    let improved = false;
    for (let i = 0; i < tunables.length && evals < maxEvals; i++) {
      const t = tunables[i];
      const step = steps[i];
      if (!t || step === undefined || step <= 0.01) continue;
      const current = getAt(work, t.path) as number;
      for (const dir of [1, -1] as const) {
        const next = candidate(t, current, step, dir);
        if (next === current) continue;
        setAt(work, t.path, next);
        const s = evaluate(lib, work, ref, opts).score;
        evals++;
        yield { evals, maxEvals, score: Math.min(best, s) };
        if (s < best - 1e-9) {
          best = s;
          improved = true;
          // Keep going the same way while it keeps helping.
          let at = next;
          while (evals < maxEvals) {
            const further = candidate(t, at, step, dir);
            if (further === at) break;
            setAt(work, t.path, further);
            const s2 = evaluate(lib, work, ref, opts).score;
            evals++;
            yield { evals, maxEvals, score: Math.min(best, s2) };
            if (s2 >= best - 1e-9) {
              setAt(work, t.path, at);
              break;
            }
            best = s2;
            at = further;
          }
          break;
        }
        setAt(work, t.path, current);
        if (evals >= maxEvals) break;
      }
    }
    if (!improved) for (let i = 0; i < steps.length; i++) steps[i] = (steps[i] ?? 0) / 2;
  }

  const changes: ParamChange[] = [];
  for (const t of tunables) {
    const after = getAt(work, t.path) as number;
    if (Math.abs(after - t.value) > 1e-9) changes.push({ tunable: t, before: t.value, after });
  }
  const last = evaluate(lib, work, ref, opts);
  return {
    caseAfter: work,
    changes,
    scoreBefore: first.score,
    scoreAfter: last.score,
    rmseBefore: first.rmse,
    rmseAfter: last.rmse,
    evals,
  };
}

export function fitCase(
  lib: EngineLibrary,
  c: CaseDef,
  ref: Reference,
  opts: FitOptions,
): FitResult {
  const gen = fitSteps(lib, c, ref, opts);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}

/**
 * Severity of one process at each reference second, from a run of the case
 * with the reference's actions (used to place hints and patient lines).
 */
export function severityTimeline(
  lib: EngineLibrary,
  c: CaseDef,
  ref: Reference,
  processId: string,
  opts: FitOptions,
): Map<number, number> {
  const offset = opts.offsetSec ?? 0;
  const { steps } = buildScript(ref, lib, c, offset);
  const lastT = ref.rows[ref.rows.length - 1]?.t ?? 0;
  const out = new Map<number, number>();
  const start = new SimpleEngine(lib);
  start.load(c, opts.seed);
  out.set(-offset, start.severities()[processId] ?? 0);
  runScript(lib, c, opts.seed, steps, {
    maxSec: Math.max(1, Math.ceil(lastT + offset) + 1),
    stopOnOutcome: false,
    onTick: (e) => out.set(e.time - offset, e.severities()[processId] ?? 0),
  });
  return out;
}
