/**
 * Records the event log and a vitals trace, and exports both as JSON or CSV.
 * The CSV column names match the video-validation reference format
 * (t_sec, hr, sbp, dbp, spo2, rr, etco2, event) plus a few extras.
 */
import type { Rhythm, SimEvent, Vitals } from './types.ts';

export interface TraceRow {
  t: number;
  hr: number | null;
  sbp: number | null;
  dbp: number | null;
  map: number | null;
  spo2: number | null;
  rr: number;
  etco2: number;
  temp: number;
  gcs: number;
  rhythm: Rhythm;
}

export interface RunExport {
  format: 'bedside-sim-run';
  formatVersion: 1;
  caseId: string;
  caseVersion: number;
  seed: number;
  outcome: string | null;
  diagnosis: string | null;
  score: number | null;
  durationSec: number;
  events: SimEvent[];
  vitals: TraceRow[];
}

export type RunMeta = Omit<RunExport, 'format' | 'formatVersion' | 'events' | 'vitals'>;

const r1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

export function toRow(t: number, v: Vitals): TraceRow {
  return {
    t,
    hr: r1(v.hr),
    sbp: r1(v.sbp),
    dbp: r1(v.dbp),
    map: r1(v.map),
    spo2: r1(v.spo2),
    rr: r1(v.rr) ?? 0,
    etco2: r1(v.etco2) ?? 0,
    temp: r1(v.temp) ?? 0,
    gcs: v.gcs,
    rhythm: v.rhythm,
  };
}

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TRACE_COLS = [
  't_sec',
  'hr',
  'sbp',
  'dbp',
  'map',
  'spo2',
  'rr',
  'etco2',
  'temp',
  'gcs',
  'rhythm',
  'event',
] as const;

export class Recorder {
  readonly events: SimEvent[] = [];
  readonly trace: TraceRow[] = [];
  readonly sampleEverySec: number;
  private nextSample = 0;

  constructor(sampleEverySec = 15) {
    this.sampleEverySec = sampleEverySec;
  }

  add(events: readonly SimEvent[]): void {
    this.events.push(...events);
  }

  /** Records a row when t reaches the next sample time (or always, when forced). */
  sample(t: number, v: Vitals, force = false): void {
    if (!force && t < this.nextSample) return;
    const last = this.trace[this.trace.length - 1];
    if (last && last.t === t) this.trace[this.trace.length - 1] = toRow(t, v);
    else this.trace.push(toRow(t, v));
    this.nextSample = (Math.floor(t / this.sampleEverySec) + 1) * this.sampleEverySec;
  }

  toJSON(meta: RunMeta): RunExport {
    return {
      format: 'bedside-sim-run',
      formatVersion: 1,
      ...meta,
      events: [...this.events],
      vitals: [...this.trace],
    };
  }

  /** One row per vitals sample; `event` lists codes since the previous sample. */
  traceCSV(): string {
    const lines = [TRACE_COLS.join(',')];
    let ei = 0;
    this.trace.forEach((row, i) => {
      const isLast = i === this.trace.length - 1;
      const codes: string[] = [];
      while (ei < this.events.length) {
        const e = this.events[ei];
        if (!e || (!isLast && e.t > row.t)) break;
        codes.push(e.code);
        ei++;
      }
      const cells = [
        row.t,
        row.hr,
        row.sbp,
        row.dbp,
        row.map,
        row.spo2,
        row.rr,
        row.etco2,
        row.temp,
        row.gcs,
        row.rhythm,
        codes.join('|'),
      ];
      lines.push(cells.map(csvCell).join(','));
    });
    return lines.join('\n') + '\n';
  }

  eventsCSV(): string {
    const lines = ['t_sec,type,code,text'];
    for (const e of this.events) lines.push([e.t, e.type, e.code, e.text].map(csvCell).join(','));
    return lines.join('\n') + '\n';
  }
}
