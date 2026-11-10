import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCES,
  runValidation,
  suggestTransitions,
} from '../../../src/engine/validation/compare.ts';
import { parseReferenceCsv } from '../../../src/engine/validation/csv.ts';
import { buildScript } from '../../../src/engine/validation/events.ts';
import { buildReport } from '../../../src/ui/validation/report.ts';
import { fmtLag, fmtT, niceTicks, timeTicks } from '../../../src/ui/validation/vitals.ts';
import { caseById, LIBRARY } from '../helpers.ts';

describe('validation report', () => {
  const ana = caseById('anaphylaxis-01');
  const ref = parseReferenceCsv(
    readFileSync('src/content/validation/anaphylaxis-01-sample.csv', 'utf8'),
  );
  const transitions = suggestTransitions(buildScript(ref, LIBRARY, ana).events);
  const result = runValidation(LIBRARY, ana, ref, { seed: 1, transitions });
  const report = buildReport(result, {
    caseId: ana.id,
    caseVersion: ana.version,
    referenceName: 'sample.csv',
    referenceRows: ref.rows.length,
    referenceMeta: ref.meta,
    tolerances: DEFAULT_TOLERANCES,
    generatedAt: '2026-11-10T00:00:00.000Z',
  });

  it('records the inputs and the disclaimer', () => {
    expect(report).toMatchObject({
      case: { id: 'anaphylaxis-01' },
      seed: 1,
      offsetSec: 0,
      reference: { name: 'sample.csv', rows: 34 },
      disclaimer: 'Educational simulation. Simplified physiology. Not clinical guidance.',
    });
    expect(report.reference.meta['source']).toMatch(/Synthetic/);
  });

  it('includes every vital, event and transition with rounded numbers', () => {
    expect(report.vitals.map((v) => v.vital)).toEqual(['hr', 'sbp', 'dbp', 'spo2', 'rr', 'etco2']);
    expect(report.events).toHaveLength(9);
    const sbp = report.vitals.find((v) => v.vital === 'sbp');
    const rmse = sbp?.rmse ?? NaN;
    expect(rmse).toBe(Math.round(rmse * 1000) / 1000);
    expect(report.transitions[0]).toMatchObject({
      trigger: 'drug:adrenaline',
      referenceDelaySec: 67,
    });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});

describe('chart and number formatting', () => {
  it('makes round axis ticks that cover the range', () => {
    expect(niceTicks(82, 131)).toEqual([80, 100, 120, 140]);
    expect(niceTicks(85, 100)).toEqual([85, 90, 95, 100]);
    const t = niceTicks(0.3, 0.9);
    expect(t[0]).toBeLessThanOrEqual(0.3);
    expect(t.at(-1)).toBeGreaterThanOrEqual(0.9);
  });

  it('spaces time ticks by whole minutes', () => {
    expect(timeTicks(900)).toEqual([0, 120, 240, 360, 480, 600, 720, 840]);
    expect(timeTicks(300)).toEqual([0, 60, 120, 180, 240, 300]);
  });

  it('formats times and lags', () => {
    expect(fmtT(95)).toBe('1:35');
    expect(fmtT(-5)).toBe('−0:05');
    expect(fmtLag(78.4)).toBe('+78 s');
    expect(fmtLag(-12)).toBe('−12 s');
    expect(fmtLag(null)).toBe('–');
  });
});
