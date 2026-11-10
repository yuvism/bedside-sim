/**
 * The downloadable validation report: inputs, replayed events, per-vital
 * metrics, divergences and transition lags, in one JSON document.
 */
import type { ValidationResult } from '../../engine/validation/compare.ts';
import type { RefVital } from '../../engine/validation/csv.ts';
import { DISCLAIMER } from '../../app/Footer.tsx';

export interface ReportInputs {
  caseId: string;
  caseVersion: number;
  referenceName: string;
  referenceRows: number;
  referenceMeta: Record<string, string>;
  tolerances: Record<RefVital, number>;
  generatedAt: string;
}

const round = (n: number | null, dp = 3) =>
  n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp;

export function buildReport(r: ValidationResult, inputs: ReportInputs) {
  return {
    tool: 'Bedside sim video validation',
    schema: 1,
    disclaimer: DISCLAIMER,
    generatedAt: inputs.generatedAt,
    case: { id: inputs.caseId, version: inputs.caseVersion },
    seed: r.seed,
    offsetSec: r.offsetSec,
    reference: {
      name: inputs.referenceName,
      rows: inputs.referenceRows,
      meta: inputs.referenceMeta,
    },
    tolerances: inputs.tolerances,
    simOutcome: r.outcome,
    events: r.events.map((e) => ({ t: e.t, event: e.raw, replayedAs: e.code, note: e.note })),
    vitals: r.vitals.map((v) => ({
      vital: v.vital,
      n: v.metrics.n,
      rmse: round(v.metrics.rmse),
      mae: round(v.metrics.mae),
      bias: round(v.metrics.bias),
      maxDeviation: round(v.metrics.maxDev),
      maxDeviationAtSec: v.metrics.maxDevT,
      withinTolerance: round(v.metrics.withinTol),
      tolerance: v.metrics.tolerance,
      flagged: v.metrics.flagged,
      divergences: v.divergences,
    })),
    transitions: r.transitions.map((t) => ({
      trigger: t.trigger,
      vital: t.vital,
      direction: t.direction,
      threshold: t.threshold,
      triggerAtSec: t.triggerT,
      referenceDelaySec: round(t.refDelay, 1),
      simDelaySec: round(t.simDelay, 1),
      lagSec: round(t.lagSec, 1),
    })),
  };
}
