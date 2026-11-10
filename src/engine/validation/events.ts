/**
 * Turns the reference timeline's event column into a replay script. Event
 * ids use the same codes the engine writes to its own log, with an optional
 * amount on the end:
 *
 *   drug:<id>:<route>[:<dose>]   infusion:<id>[:<rate>|stop]   fluid:<id>[:<ml>]
 *   device:<id>[:on|off]         procedure:<id>                order:<id>
 *   talk:<id>   exam:<id>   dx:<id>   help   cpr:on|off   shock[:<joules>]   pulse_check
 *
 * Anything else is kept as a free-text annotation.
 */
import type { ScriptStep } from '../replay.ts';
import type { Action, CaseDef, EngineLibrary, Route } from '../types.ts';
import type { Reference } from './csv.ts';

export const DEFAULT_SHOCK_J = 150;

export interface MappedEvent {
  /** Reference (video) time in seconds. */
  t: number;
  raw: string;
  /** Normalised action code when the event maps to an action. */
  code: string | null;
  action: Action | null;
  /** Why it didn't map (free text, or an unknown id). */
  note: string | null;
}

type Parsed = { action: Action; code: string } | { note: string };

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

function amount(s: string | undefined, fallback: number, what: string): number | { note: string } {
  const n = num(s);
  if (n === null) return fallback;
  if (Number.isNaN(n) || n < 0) return { note: `${what} "${s}" isn't a number.` };
  return n;
}

export function parseEvent(raw: string, lib: EngineLibrary, c: CaseDef): Parsed {
  const parts = raw.trim().split(':');
  const [kind = '', id = '', a3, a4] = parts;
  const has = (list: readonly { id: string }[], x: string) => list.some((e) => e.id === x);
  switch (kind) {
    case 'drug': {
      const drug = lib.formulary.drugs.find((d) => d.id === id);
      if (!drug) return { note: `Unknown drug "${id}".` };
      const route = (a3 ?? '').toUpperCase();
      const r = drug.routes.find((x) => x.route === route);
      if (!r) return { note: `${drug.name} has no route "${a3 ?? ''}".` };
      const dose = amount(a4, r.standardDose, 'Dose');
      if (typeof dose !== 'number') return dose;
      return {
        action: { kind: 'drug', drugId: id, route: route as Route, dose },
        code: `drug:${id}:${route}`,
      };
    }
    case 'infusion': {
      const drug = lib.formulary.drugs.find((d) => d.id === id);
      if (!drug?.infusion) return { note: `"${id}" has no infusion in the formulary.` };
      if (a3 === 'stop')
        return { action: { kind: 'infusion', drugId: id, rate: 0 }, code: `infusion:${id}:stop` };
      const rate = amount(a3, drug.infusion.standardRate, 'Rate');
      if (typeof rate !== 'number') return rate;
      return { action: { kind: 'infusion', drugId: id, rate }, code: `infusion:${id}` };
    }
    case 'fluid': {
      const f = lib.formulary.fluids.find((x) => x.id === id);
      if (!f) return { note: `Unknown fluid "${id}".` };
      const ml = amount(a3, f.standardVolumeMl, 'Volume');
      if (typeof ml !== 'number') return ml;
      return { action: { kind: 'fluid', fluidId: id, volumeMl: ml }, code: `fluid:${id}` };
    }
    case 'device': {
      if (!has(lib.devices.devices, id)) return { note: `Unknown device "${id}".` };
      const on = a3 !== 'off';
      return {
        action: { kind: 'device', deviceId: id, on },
        code: `device:${id}:${on ? 'on' : 'off'}`,
      };
    }
    case 'procedure':
      return has(lib.devices.procedures, id)
        ? { action: { kind: 'procedure', procedureId: id }, code: `procedure:${id}` }
        : { note: `Unknown procedure "${id}".` };
    case 'order':
      return has(lib.investigations.investigations, id)
        ? { action: { kind: 'order', investigationId: id }, code: `order:${id}` }
        : { note: `Unknown investigation "${id}".` };
    case 'talk':
      return has(c.dialogue, id)
        ? { action: { kind: 'talk', questionId: id }, code: `talk:${id}` }
        : { note: `This case has no question "${id}".` };
    case 'exam':
      return has(c.exam, id)
        ? { action: { kind: 'exam', examId: id }, code: `exam:${id}` }
        : { note: `This case has no examination "${id}".` };
    case 'dx':
      return has(c.diagnosis.options, id)
        ? { action: { kind: 'diagnosis', diagnosisId: id }, code: `dx:${id}` }
        : { note: `This case has no diagnosis "${id}".` };
    case 'help':
      return { action: { kind: 'call_help' }, code: 'help' };
    case 'pulse_check':
      return { action: { kind: 'pulse_check' }, code: 'pulse_check' };
    case 'cpr':
      if (id !== 'on' && id !== 'off') return { note: 'Use cpr:on or cpr:off.' };
      return { action: { kind: 'cpr', on: id === 'on' }, code: `cpr:${id}` };
    case 'shock': {
      const j = amount(id || undefined, DEFAULT_SHOCK_J, 'Energy');
      if (typeof j !== 'number') return j;
      return { action: { kind: 'shock', joules: j }, code: 'shock' };
    }
    default:
      return { note: 'Annotation (free text, not replayed).' };
  }
}

/**
 * Maps every reference event and builds the replay script. offsetSec shifts
 * reference time onto sim time: simT = refT + offsetSec.
 */
export function buildScript(
  ref: Reference,
  lib: EngineLibrary,
  c: CaseDef,
  offsetSec = 0,
): { steps: ScriptStep[]; events: MappedEvent[] } {
  const steps: ScriptStep[] = [];
  const events: MappedEvent[] = [];
  for (const row of ref.rows) {
    for (const raw of row.events) {
      const p = parseEvent(raw, lib, c);
      const simT = Math.round(row.t + offsetSec);
      if ('note' in p) {
        events.push({ t: row.t, raw, code: null, action: null, note: p.note });
      } else if (simT < 0) {
        events.push({
          t: row.t,
          raw,
          code: p.code,
          action: null,
          note: 'Before the simulation starts (check the offset).',
        });
      } else {
        steps.push({ t: simT, action: p.action });
        events.push({ t: row.t, raw, code: p.code, action: p.action, note: null });
      }
    }
  }
  return { steps, events };
}
