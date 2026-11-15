import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  actionCodes,
  buildPrompt,
  mockReply,
  parseClock,
  replyToRows,
} from '../../../server/autofill.ts';
import { getCase } from '../../../src/content/cases.ts';
import { LIBRARY } from '../../../src/content/library.ts';
import { parseReferenceCsv } from '../../../src/engine/validation/csv.ts';

const asthma = getCase('asthma-02')!;
const reading = (time: string, v: Record<string, unknown>) => ({
  time,
  hr: null,
  sbp: null,
  dbp: null,
  spo2: null,
  rr: null,
  etco2: null,
  ...v,
});

describe('parseClock', () => {
  it('reads MM:SS, H:MM:SS, seconds and numbers', () => {
    expect(parseClock('01:30')).toBe(90);
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock('45')).toBe(45);
    expect(parseClock('0:07.6')).toBe(8);
    expect(parseClock(12)).toBe(12);
  });
  it('rejects anything else', () => {
    for (const bad of ['', 'abc', '1:-2', '1:2:3:4', -5, null, undefined]) {
      expect(parseClock(bad)).toBeNull();
    }
  });
});

describe('replyToRows', () => {
  it('keeps clear readings, drops misreads and sorts by time', () => {
    const r = replyToRows(
      {
        readings: [
          reading('00:20', { hr: 130, spo2: 140 }),
          reading('00:10', { hr: '128', sbp: 150, dbp: 80 }),
          reading('00:30', {}),
          reading('soon', { hr: 100 }),
        ],
        events: [],
        notes: 'Monitor partly hidden.',
      },
      asthma,
      LIBRARY,
    );
    expect(r.rows.map((x) => x.t)).toEqual([10, 20]);
    expect(r.rows[0]?.values).toMatchObject({ hr: 128, sbp: 150, dbp: 80, spo2: null });
    expect(r.rows[1]?.values.spo2).toBeNull(); // 140 % is a misread
    expect(r.notes).toBe('Monitor partly hidden.');
  });

  it('keeps valid action codes, turns unknown ones into notes and merges by time', () => {
    const r = replyToRows(
      {
        readings: [reading('01:00', { hr: 90 })],
        events: [
          { time: '01:00', code: 'procedure:front_of_neck_access', description: 'Neck airway' },
          { time: '01:00', code: 'drug:unobtainium:IV', description: 'Made-up drug; given' },
          { time: '02:00', code: null, description: 'Team leader calls for help' },
        ],
        notes: '',
      },
      asthma,
      LIBRARY,
    );
    expect(r.unmatched).toBe(1);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.event).toBe(
      'procedure:front_of_neck_access; Neck airway; Made-up drug, given',
    );
    expect(r.rows[1]).toMatchObject({ t: 120, event: 'Team leader calls for help' });
  });

  it('rejects answers in the wrong shape', () => {
    expect(() => replyToRows({ readings: 'none' }, asthma, LIBRARY)).toThrow();
  });
});

describe('prompt and codes', () => {
  it('lists real drug routes instead of wildcards', () => {
    const codes = actionCodes(asthma, LIBRARY);
    expect(codes.some((c) => c.endsWith(':*'))).toBe(false);
    expect(codes).toContain('procedure:front_of_neck_access');
    expect(codes.some((c) => c.startsWith('drug:salbutamol:'))).toBe(true);
    const prompt = buildPrompt(codes);
    expect(prompt).toContain('procedure:front_of_neck_access');
    expect(prompt).toMatch(/Never estimate/);
    expect(prompt).toMatch(/Do not quote dialogue/);
  });
});

describe('mock mode', () => {
  it('reproduces the AMAX4 annotation through the real parser', () => {
    const csv = readFileSync('src/content/validation/amax4-simulation-annotation.csv', 'utf8');
    const ref = parseReferenceCsv(csv);
    const r = replyToRows(mockReply(csv, asthma, LIBRARY), asthma, LIBRARY);
    const withValues = ref.rows.filter((x) => Object.values(x.values).some((v) => v !== null));
    for (const row of withValues) {
      expect(r.rows.find((x) => x.t === row.t)?.values).toEqual(row.values);
    }
    expect(r.rows.some((x) => x.event.includes('procedure:front_of_neck_access'))).toBe(true);
    expect(r.unmatched).toBe(0);
  });
});
