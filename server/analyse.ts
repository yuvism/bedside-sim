/**
 * "Update itself and add what's missing", run on the server: fit the case
 * to the video timeline, then propose additions. The same engine code the
 * browser used before, so results are identical for the same seed.
 */
import {
  fitSteps,
  severityTimeline,
  type FitProgress,
  type FitResult,
} from '../src/engine/learning/fit.ts';
import { proposeAdditions, type Addition } from '../src/engine/learning/propose.ts';
import type { CaseDef, EngineLibrary } from '../src/engine/types.ts';
import type { Reference } from '../src/engine/validation/csv.ts';
import { buildScript } from '../src/engine/validation/events.ts';

export interface Analysis {
  fit: FitResult;
  additions: Addition[];
}

export const MAX_EVALS = 300;

const breathe = () => new Promise<void>((r) => setImmediate(r));

/** Runs the fit, reporting progress, and yields to the event loop as it goes. */
export async function analyse(
  lib: EngineLibrary,
  caseDef: CaseDef,
  ref: Reference,
  opts: { seed: number; name: string; maxEvals?: number },
  onProgress: (p: FitProgress) => void = () => undefined,
): Promise<Analysis> {
  const gen = fitSteps(lib, caseDef, ref, {
    seed: opts.seed,
    maxEvals: opts.maxEvals ?? MAX_EVALS,
  });
  let fit: FitResult | null = null;
  for (let i = 1; fit === null; i++) {
    const r = gen.next();
    if (r.done) fit = r.value;
    else if (i % 8 === 0) {
      onProgress(r.value);
      await breathe();
    }
  }
  const proc = fit.caseAfter.bands.process;
  const sev = severityTimeline(lib, fit.caseAfter, ref, proc, { seed: opts.seed });
  const additions = proposeAdditions({
    lib,
    caseDef: fit.caseAfter,
    events: buildScript(ref, lib, fit.caseAfter).events,
    severityAt: (t) => sev.get(Math.round(t)) ?? null,
    referenceName: opts.name,
  });
  return { fit, additions };
}
