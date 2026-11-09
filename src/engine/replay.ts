/**
 * Headless runners. `runScript` plays a timed list of actions; `runPolicy`
 * asks a function what to do each second, so a scripted "ideal clinician"
 * can react to what happens (VF, a falling SpO2, a result coming back).
 * Used by tests, video validation and the Unity parity fixture.
 */
import { SimpleEngine } from './engine.ts';
import { Recorder, type TraceRow } from './recorder.ts';
import type { Action, CaseDef, EngineLibrary, EngineState, Outcome, SimEvent } from './types.ts';

export interface ScriptStep {
  /** Sim second at which to apply the action (before that second's tick). */
  t: number;
  action: Action;
}

export interface RunOptions {
  maxSec: number;
  /** Stop as soon as the case reaches an outcome (stabilised or died). Default true. */
  stopOnOutcome?: boolean;
  /** Stop at the first cardiac arrest. Default false. */
  stopOnArrest?: boolean;
  sampleEverySec?: number;
  /** Called after every tick, e.g. to collect severity for analysis. */
  onTick?: (engine: SimpleEngine) => void;
}

export interface RunResult {
  outcome: Outcome | null;
  /** Time of the first cardiac arrest, if any. */
  arrestT: number | null;
  endT: number;
  events: SimEvent[];
  trace: TraceRow[];
  final: EngineState;
  recorder: Recorder;
}

/** Decides what to do at each sim second, given the engine and the log so far. */
export type Policy = (engine: SimpleEngine, events: readonly SimEvent[]) => Action[] | undefined;

export function runPolicy(
  lib: EngineLibrary,
  caseDef: CaseDef,
  seed: number,
  policy: Policy,
  opts: RunOptions,
): RunResult {
  const engine = new SimpleEngine(lib);
  engine.load(caseDef, seed);
  const rec = new Recorder(opts.sampleEverySec ?? 15);
  const stopOnOutcome = opts.stopOnOutcome ?? true;
  let arrestT: number | null = null;
  rec.sample(0, engine.vitals());
  while (engine.time < opts.maxSec) {
    for (const action of policy(engine, rec.events) ?? []) rec.add(engine.apply(action));
    const evs = engine.step(1);
    rec.add(evs);
    if (arrestT === null) arrestT = evs.find((e) => e.code === 'arrest')?.t ?? null;
    rec.sample(engine.time, engine.vitals());
    opts.onTick?.(engine);
    if (stopOnOutcome && engine.status().outcome) break;
    if (opts.stopOnArrest && arrestT !== null) break;
  }
  rec.sample(engine.time, engine.vitals(), true);
  return {
    outcome: engine.status().outcome,
    arrestT,
    endT: engine.time,
    events: rec.events,
    trace: rec.trace,
    final: engine.snapshot(),
    recorder: rec,
  };
}

export function runScript(
  lib: EngineLibrary,
  caseDef: CaseDef,
  seed: number,
  script: readonly ScriptStep[],
  opts: RunOptions,
): RunResult {
  const steps = [...script].sort((a, b) => a.t - b.t);
  let i = 0;
  return runPolicy(
    lib,
    caseDef,
    seed,
    (engine) => {
      const out: Action[] = [];
      while (i < steps.length && (steps[i]?.t ?? Infinity) <= engine.time) {
        const step = steps[i++];
        if (step) out.push(step.action);
      }
      return out;
    },
    opts,
  );
}
