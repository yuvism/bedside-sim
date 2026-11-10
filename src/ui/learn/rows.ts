/** Annotation rows for "Learn from a video", to and from the reference CSV. */
import { csvCell } from '../../engine/recorder.ts';
import {
  parseReferenceCsv,
  REF_VITALS,
  type Reference,
  type RefVital,
} from '../../engine/validation/csv.ts';

export interface Row {
  t: number;
  values: Record<RefVital, number | null>;
  event: string;
}

export const emptyValues = (): Record<RefVital, number | null> =>
  Object.fromEntries(REF_VITALS.map((v) => [v, null])) as Record<RefVital, number | null>;

export function rowsFromReference(ref: Reference): Row[] {
  return ref.rows.map((r) => ({ t: r.t, values: { ...r.values }, event: r.events.join('; ') }));
}

export function rowsToCsv(rows: readonly Row[], meta: Record<string, string>): string {
  const head = Object.entries(meta).map(([k, v]) => `# ${k}: ${v}`);
  const lines = [...head, ['t_sec', ...REF_VITALS, 'event'].join(',')];
  for (const r of [...rows].sort((a, b) => a.t - b.t)) {
    lines.push(
      [r.t, ...REF_VITALS.map((v) => r.values[v]), r.event || null].map(csvCell).join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Round trip through the CSV parser, so the page and the file always agree. */
export function rowsToReference(rows: readonly Row[], meta: Record<string, string>): Reference {
  return parseReferenceCsv(rowsToCsv(rows, meta));
}
