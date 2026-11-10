/**
 * Reads a reference timeline annotated from a treatment video:
 *
 *   t_sec,hr,sbp,dbp,spo2,rr,etco2,event
 *   0,128,82,48,93,26,30,
 *   95,,,,,,,drug:adrenaline:IM
 *
 * Blank cells mean "not observed". `event` holds action ids or free text;
 * several events in one cell are separated by ";". Lines starting with "#"
 * are comments, and "# key: value" comments set metadata (case, seed, offset).
 */

export const REF_VITALS = ['hr', 'sbp', 'dbp', 'spo2', 'rr', 'etco2'] as const;
export type RefVital = (typeof REF_VITALS)[number];

export interface RefRow {
  /** Seconds from the start of the video annotation. */
  t: number;
  values: Record<RefVital, number | null>;
  events: string[];
}

export interface Reference {
  rows: RefRow[];
  /** From "# key: value" comment lines, keys lower-cased. */
  meta: Record<string, string>;
  warnings: string[];
}

export class ReferenceCsvError extends Error {}

const NULLS = new Set(['', 'na', 'n/a', '-', 'null']);

/** Splits one CSV line, honouring double quotes ("a, b" and "" escapes). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseReferenceCsv(text: string): Reference {
  const meta: Record<string, string> = {};
  const warnings: string[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let header: string[] | null = null;
  const rows: RefRow[] = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      const m = /^#\s*([A-Za-z_][\w -]*?)\s*:\s*(.+)$/.exec(line);
      if (m?.[1] && m[2]) meta[m[1].toLowerCase()] = m[2].trim();
      return;
    }
    const cells = splitCsvLine(line);
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      if (!header.includes('t_sec') && !header.includes('t')) {
        throw new ReferenceCsvError('The header needs a t_sec column.');
      }
      const known = new Set<string>(['t_sec', 't', 'event', ...REF_VITALS]);
      const extra = header.filter((h) => h && !known.has(h));
      if (extra.length) warnings.push(`Ignored columns: ${extra.join(', ')}.`);
      return;
    }
    const cols = header;
    const cell = (name: string) => {
      const j = cols.indexOf(name);
      return j >= 0 ? (cells[j] ?? '') : '';
    };
    const tText = cell('t_sec') || cell('t');
    const t = Number(tText);
    if (!tText || !Number.isFinite(t) || t < 0) {
      warnings.push(`Line ${i + 1}: skipped, t_sec "${tText}" isn't a time in seconds.`);
      return;
    }
    const values = {} as Record<RefVital, number | null>;
    for (const v of REF_VITALS) {
      const c = cell(v);
      if (NULLS.has(c.toLowerCase())) {
        values[v] = null;
        continue;
      }
      const n = Number(c);
      if (Number.isFinite(n)) values[v] = n;
      else {
        values[v] = null;
        warnings.push(`Line ${i + 1}: ${v} "${c}" isn't a number, so it was left blank.`);
      }
    }
    const events = cell('event')
      .split(';')
      .map((e) => e.trim())
      .filter(Boolean);
    rows.push({ t, values, events });
  });

  if (!header) throw new ReferenceCsvError('The file is empty: it needs a header row.');
  if (!rows.length) throw new ReferenceCsvError('The file has a header but no data rows.');
  rows.sort((a, b) => a.t - b.t);
  return { rows, meta, warnings };
}
