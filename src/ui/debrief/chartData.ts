/**
 * Turns a run's trace and event log into chart-ready points and numbered
 * action markers on the same time axis (minutes).
 */
import type { TraceRow } from '../../engine/recorder.ts';
import type { SimEvent } from '../../engine/types.ts';

export interface ChartPoint {
  t: number;
  min: number;
  hr: number | null;
  sbp: number | null;
  spo2: number | null;
  rr: number | null;
}

export interface Marker {
  n: number;
  t: number;
  min: number;
  code: string;
  label: string;
  harmful: boolean;
}

const MARKED = ['drug:', 'fluid:', 'device:', 'procedure:', 'dx:', 'help'];

export function isMarkerEvent(e: SimEvent): boolean {
  if (e.code.startsWith('adverse:')) return true;
  return e.type === 'action' && MARKED.some((p) => e.code === p || e.code.startsWith(p));
}

const toMin = (t: number) => Math.round((t / 60) * 1000) / 1000;

export function buildChartData(trace: readonly TraceRow[], events: readonly SimEvent[]) {
  const points: ChartPoint[] = trace.map((r) => ({
    t: r.t,
    min: toMin(r.t),
    hr: r.hr,
    sbp: r.sbp,
    spo2: r.spo2,
    rr: r.sbp === null && r.rr === 0 ? null : r.rr,
  }));
  const markers: Marker[] = events.filter(isMarkerEvent).map((e, i) => ({
    n: i + 1,
    t: e.t,
    min: toMin(e.t),
    code: e.code,
    label: e.text,
    harmful: e.code.startsWith('adverse:') && e.data?.['harm'] === true,
  }));
  const lastT = Math.max(trace.at(-1)?.t ?? 0, markers.at(-1)?.t ?? 0, 60);
  return { points, markers, maxMin: Math.ceil(lastT / 60) };
}

/** The trace sample closest in time to t (seconds). */
export function nearestPoint(points: readonly ChartPoint[], t: number): ChartPoint | undefined {
  let best: ChartPoint | undefined;
  for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best;
}
