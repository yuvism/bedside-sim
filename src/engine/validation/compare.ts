/**
 * Video validation: replays a reference timeline's actions through the
 * engine (same case, same seed) and compares the simulated vitals with the
 * reference observations.
 */
import { runScript } from '../replay.ts';
import type { TraceRow } from '../recorder.ts';
import type { CaseDef, EngineLibrary, Outcome } from '../types.ts';
import { REF_VITALS, type RefVital, type Reference } from './csv.ts';
import { buildScript, type MappedEvent } from './events.ts';
import {
  crossingTime,
  divergences,
  seriesMetrics,
  type Divergence,
  type Pair,
  type Point,
  type SeriesMetrics,
} from './metrics.ts';

/** Starting tolerances (absolute units); the user sets their own. */
export const DEFAULT_TOLERANCES: Record<RefVital, number> = {
  hr: 10,
  sbp: 10,
  dbp: 10,
  spo2: 3,
  rr: 4,
  etco2: 5,
};

export interface TransitionSpec {
  id: string;
  /** Action-code prefix that starts the clock, e.g. "drug:adrenaline". */
  trigger: string;
  vital: RefVital;
  direction: 'above' | 'below';
  threshold: number;
}

export interface TransitionResult extends TransitionSpec {
  /** Reference time of the first matching event, if any. */
  triggerT: number | null;
  /** Reference-time crossing in the video and in the sim. */
  refT: number | null;
  simT: number | null;
  /** Seconds from trigger to crossing. */
  refDelay: number | null;
  simDelay: number | null;
  /** simT − refT: positive when the sim responds later. */
  lagSec: number | null;
}

export interface ValidationOptions {
  seed: number;
  /** simT = refT + offsetSec. */
  offsetSec?: number;
  tolerances?: Partial<Record<RefVital, number>>;
  transitions?: readonly TransitionSpec[];
}

export interface VitalComparison {
  vital: RefVital;
  pairs: Pair[];
  metrics: SeriesMetrics;
  divergences: Divergence[];
}

export interface ValidationResult {
  events: MappedEvent[];
  /** Simulated trace, one row per second, on reference time. */
  sim: TraceRow[];
  vitals: VitalComparison[];
  transitions: TransitionResult[];
  outcome: Outcome | null;
  offsetSec: number;
  seed: number;
}

/** A sensible first transition: the first drug given, to SBP above 90. */
export function suggestTransitions(events: readonly MappedEvent[]): TransitionSpec[] {
  const drug = events.find((e) => e.code?.startsWith('drug:'));
  if (!drug?.code) return [];
  const trigger = drug.code.split(':').slice(0, 2).join(':');
  return [{ id: 'tr-1', trigger, vital: 'sbp', direction: 'above', threshold: 90 }];
}

export function runValidation(
  lib: EngineLibrary,
  caseDef: CaseDef,
  ref: Reference,
  opts: ValidationOptions,
): ValidationResult {
  const offset = opts.offsetSec ?? 0;
  const { steps, events } = buildScript(ref, lib, caseDef, offset);
  const lastT = ref.rows[ref.rows.length - 1]?.t ?? 0;
  const run = runScript(lib, caseDef, opts.seed, steps, {
    maxSec: Math.max(1, Math.ceil(lastT + offset) + 1),
    stopOnOutcome: false,
    sampleEverySec: 1,
  });
  const sim = run.trace.map((r) => ({ ...r, t: r.t - offset }));
  const byT = new Map(sim.map((r) => [Math.round(r.t), r]));
  const tol = { ...DEFAULT_TOLERANCES, ...opts.tolerances };

  const vitals = REF_VITALS.map((vital): VitalComparison => {
    const pairs: Pair[] = [];
    for (const row of ref.rows) {
      const r = row.values[vital];
      const s = byT.get(Math.round(row.t))?.[vital];
      if (r !== null && s !== null && s !== undefined) pairs.push({ t: row.t, ref: r, sim: s });
    }
    return {
      vital,
      pairs,
      metrics: seriesMetrics(pairs, tol[vital]),
      divergences: divergences(pairs, tol[vital]),
    };
  });

  const transitions = (opts.transitions ?? []).map((spec): TransitionResult => {
    const trig = events.find((e) => e.code !== null && e.code.startsWith(spec.trigger));
    const triggerT = trig ? trig.t : null;
    if (triggerT === null) {
      return {
        ...spec,
        triggerT,
        refT: null,
        simT: null,
        refDelay: null,
        simDelay: null,
        lagSec: null,
      };
    }
    const refSeries: Point[] = ref.rows.map((r) => ({ t: r.t, v: r.values[spec.vital] }));
    const simSeries: Point[] = sim.map((r) => ({ t: r.t, v: r[spec.vital] }));
    const refT = crossingTime(refSeries, triggerT, spec.direction, spec.threshold);
    const simT = crossingTime(simSeries, triggerT, spec.direction, spec.threshold);
    return {
      ...spec,
      triggerT,
      refT,
      simT,
      refDelay: refT === null ? null : refT - triggerT,
      simDelay: simT === null ? null : simT - triggerT,
      lagSec: refT === null || simT === null ? null : simT - refT,
    };
  });

  return {
    events,
    sim,
    vitals,
    transitions,
    outcome: run.outcome,
    offsetSec: offset,
    seed: opts.seed,
  };
}
