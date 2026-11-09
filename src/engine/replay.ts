/**
 * Headless runner: plays a timed script of actions through a fresh engine.
 * Used by tests, the video-validation mode and the Unity parity fixture.
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
  /** Stop as soon as the case reaches an outcome. Default true. */
  stopOnOutcome?: boolean;
  sampleEverySec?: number;
  /** Called after every tick, e.g. to collect severity for analysis. */
  onTick?: (engine: SimpleEngine) => void;
}

export interface RunResult {
  outcome: Outcome | null;
  endT: number;
  events: SimEvent[];
  trace: TraceRow[];
  final: EngineState;
  recorder: Recorder;
}

export function runScript(
  lib: EngineLibrary,
  caseDef: CaseDef,
  seed: number,
  script: readonly ScriptStep[],
  opts: RunOptions,
): RunResult {
  const engine = new SimpleEngine(lib);
  engine.load(caseDef, seed);
  const rec = new Recorder(opts.sampleEverySec ?? 15);
  const steps = [...script].sort((a, b) => a.t - b.t);
  const stopOnOutcome = opts.stopOnOutcome ?? true;
  let i = 0;
  rec.sample(0, engine.vitals());
  while (engine.time < opts.maxSec) {
    while (i < steps.length && (steps[i]?.t ?? Infinity) <= engine.time) {
      const step = steps[i++];
      if (step) rec.add(engine.apply(step.action));
    }
    rec.add(engine.step(1));
    rec.sample(engine.time, engine.vitals());
    opts.onTick?.(engine);
    if (stopOnOutcome && engine.status().outcome) break;
  }
  rec.sample(engine.time, engine.vitals(), true);
  return {
    outcome: engine.status().outcome,
    endT: engine.time,
    events: rec.events,
    trace: rec.trace,
    final: engine.snapshot(),
    recorder: rec,
  };
}
