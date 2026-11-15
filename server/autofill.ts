/**
 * "Autofill with AI": what we ask Gemini, the JSON shape it must answer in,
 * and how that answer becomes timeline rows for the teacher to check.
 * Pure functions, so the parsing is unit-tested without calling Gemini.
 */
import { z } from 'zod';
import { buildLists } from '../src/ui/editor/suggestions.ts';
import type { CaseDef, EngineLibrary } from '../src/engine/types.ts';
import { parseReferenceCsv, REF_VITALS, type RefVital } from '../src/engine/validation/csv.ts';
import { parseEvent } from '../src/engine/validation/events.ts';
import { plausibleReading } from '../src/engine/validation/ranges.ts';

export interface AutofillRow {
  t: number;
  values: Record<RefVital, number | null>;
  event: string;
}

export interface AutofillResult {
  rows: AutofillRow[];
  notes: string;
  /** Events whose code wasn't a valid action for this case (kept as notes). */
  unmatched: number;
}

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

/** JSON schema for Gemini's answer. */
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    readings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string', description: 'MM:SS from the start of the video' },
          ...Object.fromEntries(REF_VITALS.map((v) => [v, nullableNumber])),
        },
        required: ['time', ...REF_VITALS],
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          time: { type: 'string', description: 'MM:SS from the start of the video' },
          code: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          description: { type: 'string' },
        },
        required: ['time', 'code', 'description'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['readings', 'events', 'notes'],
};

/** Action codes Gemini may use for this case, with each drug's real routes. */
export function actionCodes(c: CaseDef, lib: EngineLibrary): string[] {
  const codes = buildLists(c, lib)['codes'] ?? [];
  return codes.flatMap((code) => {
    const m = /^drug:([^:]+):\*$/.exec(code);
    if (!m) return [code];
    const drug = lib.formulary.drugs.find((d) => d.id === m[1]);
    return drug ? drug.routes.map((r) => `drug:${drug.id}:${r.route}`) : [];
  });
}

export function buildPrompt(codes: readonly string[]): string {
  return [
    'You are helping a clinical teacher annotate a training video of a simulated or de-identified resuscitation, for an educational patient simulator.',
    '',
    'READINGS. Every 10 seconds of video time, starting at 00:00, read the patient monitor or on-screen vital-signs overlay and report:',
    'hr (heart rate per minute), sbp and dbp (blood pressure, mmHg), spo2 (oxygen saturation, %), rr (respiratory rate per minute), etco2 (end-tidal CO2 in mmHg; multiply kPa by 7.5).',
    'Use null for any value that is not shown, unreadable, changing mid-frame or shown as dashes. Never estimate a value from the clinical picture. Leave out a time if nothing is readable.',
    '',
    'EVENTS. List each clinical action the team performs or clearly orders (drugs, fluids, oxygen and airway devices, procedures, tests, calling for help, CPR, shocks) at the time it happens.',
    `Set code to one of these when it matches: ${codes.join(', ')}.`,
    'For a drug, add the stated dose in the drug’s usual unit on the end when you know it, for example drug:adrenaline:IM:0.5. Otherwise set code to null.',
    'description: a few plain words in your own words. Do not quote dialogue or captions, and never describe anyone’s appearance or identity.',
    '',
    'notes: one or two sentences on anything that made reading hard. Times are MM:SS from the start of the video.',
  ].join('\n');
}

/** "MM:SS", "H:MM:SS", "SS" or a plain number of seconds, to whole seconds. */
export function parseClock(s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) && s >= 0 ? Math.round(s) : null;
  if (typeof s !== 'string') return null;
  const parts = s.trim().split(':');
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p)))
    return null;
  const total = parts.reduce((acc, p) => acc * 60 + Number(p), 0);
  return Math.round(total);
}

const asNumber = (x: unknown): unknown =>
  typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : x;

const Reply = z.object({
  readings: z.array(z.record(z.string(), z.unknown())).default([]),
  events: z
    .array(
      z.object({
        time: z.unknown(),
        code: z.string().nullable().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  notes: z.string().optional(),
});

const clean = (s: string) =>
  s
    .replace(/[;\r\n]+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

/** Turns Gemini's JSON into checked, sorted timeline rows. */
export function replyToRows(reply: unknown, c: CaseDef, lib: EngineLibrary): AutofillResult {
  const r = Reply.parse(reply);
  const byT = new Map<number, AutofillRow>();
  const rowAt = (t: number) => {
    let row = byT.get(t);
    if (!row) {
      row = {
        t,
        values: Object.fromEntries(REF_VITALS.map((v) => [v, null])) as AutofillRow['values'],
        event: '',
      };
      byT.set(t, row);
    }
    return row;
  };

  for (const reading of r.readings) {
    const t = parseClock(reading['time']);
    if (t === null) continue;
    const values = REF_VITALS.map((v) => [v, plausibleReading(v, asNumber(reading[v]))] as const);
    if (values.every(([, x]) => x === null)) continue;
    const row = rowAt(t);
    for (const [v, x] of values) if (x !== null) row.values[v] = x;
  }

  let unmatched = 0;
  for (const ev of r.events) {
    const t = parseClock(ev.time);
    if (t === null) continue;
    const desc = clean(ev.description ?? '');
    const raw = (ev.code ?? '').trim();
    let code = '';
    if (raw) {
      if ('action' in parseEvent(raw, lib, c)) code = raw;
      else unmatched++;
    }
    const text = [code, desc].filter(Boolean).join('; ');
    if (!text) continue;
    const row = rowAt(t);
    row.event = row.event ? `${row.event}; ${text}` : text;
  }

  return {
    rows: [...byT.values()].sort((a, b) => a.t - b.t),
    notes: clean(r.notes ?? ''),
    unmatched,
  };
}

const clock = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

/**
 * A stand-in for Gemini (GEMINI_MOCK=1): the bundled AMAX4 annotation in
 * Gemini's answer format, so tests and offline demos run the real parsing.
 */
export function mockReply(csv: string, c: CaseDef, lib: EngineLibrary): unknown {
  const ref = parseReferenceCsv(csv);
  return {
    readings: ref.rows
      .filter((row) => REF_VITALS.some((v) => row.values[v] !== null))
      .map((row) => ({ time: clock(row.t), ...row.values })),
    events: ref.rows.flatMap((row) =>
      row.events.map((e) =>
        'action' in parseEvent(e, lib, c)
          ? { time: clock(row.t), code: e, description: '' }
          : { time: clock(row.t), code: null, description: e },
      ),
    ),
    notes: 'Mock autofill: these rows come from the bundled AMAX4 annotation, not from your video.',
  };
}
