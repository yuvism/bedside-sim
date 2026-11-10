/**
 * Suggestion lists for id-like fields (shown as a datalist under the input):
 * drug, device and procedure ids from the shared library, and ids defined
 * elsewhere in the case being edited.
 */
import type { EngineLibrary } from '../../engine/types.ts';
import type { Path } from './form/context.ts';

export type Lists = Record<string, string[]>;

const PHYS = [
  'hr',
  'sbp',
  'dbp',
  'rr',
  'temp',
  'glucose',
  'gcs',
  'etco2',
  'vq',
  'shunt',
  'ventLoss',
];
const SIGNS = [
  'anxiety',
  'effort',
  'sweating',
  'flush',
  'hives',
  'itch',
  'lipSwelling',
  'stridor',
  'wheeze',
  'silentChest',
  'weakness',
  'pinpoint',
  'pain',
  'ecg_peakedT',
  'ecg_wide',
  'ecg_st',
];

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ids = (v: unknown): string[] =>
  arr(v)
    .map((x) => obj(x)['id'])
    .filter((x): x is string => typeof x === 'string' && x !== '');

export function buildLists(data: unknown, lib: EngineLibrary): Lists {
  const c = obj(data);
  const labs = Object.keys(obj(c['labs']));
  const drugs = lib.formulary.drugs.map((d) => d.id);
  const devices = lib.devices.devices.map((d) => d.id);
  const procedures = lib.devices.procedures.map((p) => p.id);
  const investigations = lib.investigations.investigations.map((i) => i.id);
  const fluids = lib.formulary.fluids.map((f) => f.id);
  const caseInv = ids(c['investigations']);
  return {
    drugs,
    infusions: lib.formulary.drugs.filter((d) => d.infusion).map((d) => d.id),
    devices,
    procedures,
    investigations,
    processes: ids(c['processes']),
    labs: [...new Set([...labs, 'ph', 'paco2', 'pao2', 'lactate', 'hco3'])],
    targets: [...PHYS, ...SIGNS.map((s) => `sign:${s}`), ...labs.map((l) => `lab:${l}`)],
    dialogue: ids(c['dialogue']),
    exam: ids(c['exam']),
    diagnoses: ids(obj(c['diagnosis'])['options']),
    rules: ids(c['scoring']),
    outcomes: ['stabilised', 'died', 'arrest', 'ended'],
    allergies: [...new Set(lib.formulary.drugs.flatMap((d) => d.allergyClasses ?? []))],
    codes: [
      'help',
      'shock',
      'cpr:on',
      ...ids(c['dialogue']).map((x) => `talk:${x}`),
      ...ids(c['exam']).map((x) => `exam:${x}`),
      ...caseInv.map((x) => `order:${x}`),
      ...devices.map((x) => `device:${x}:on`),
      ...procedures.map((x) => `procedure:${x}`),
      ...drugs.map((x) => `drug:${x}:*`),
      ...fluids.map((x) => `fluid:${x}`),
      ...ids(obj(c['diagnosis'])['options']).map((x) => `dx:${x}`),
    ],
  };
}

function at(data: unknown, path: Path): unknown {
  let cur = data;
  for (const p of path) cur = obj(cur)[String(p)];
  return cur;
}

/** Which list (if any) a field gets, from its key and where it sits. */
export function listFor(key: string, path: Path, data: unknown): string | undefined {
  switch (key) {
    case 'drugGiven':
    case 'effect':
      return 'drugs';
    case 'infusing':
      return 'infusions';
    case 'device':
      return 'devices';
    case 'procedure':
      return 'procedures';
    case 'severity':
      return 'processes';
    case 'lab':
      return 'labs';
    case 'target':
      return 'targets';
    case 'codes':
    case 'before':
      return 'codes';
    case 'outcomes':
      return 'outcomes';
    case 'correct':
      return 'diagnoses';
    case 'allergies':
      return 'allergies';
    case 'process':
      return path[0] === 'bands' ? 'processes' : undefined;
    case 'ids': {
      // ids[i] sits two levels under the test that owns it.
      const type = obj(at(data, path.slice(0, -2)))['type'];
      if (type === 'asked') return 'dialogue';
      if (type === 'examined') return 'exam';
      if (type === 'diagnosisIs') return 'diagnoses';
      return undefined;
    }
    case 'id': {
      if (path[0] === 'investigations' && path.length === 3) return 'investigations';
      const type = obj(at(data, path.slice(0, -1)))['type'];
      return type === 'rulePassed' || type === 'ruleFailed' ? 'rules' : undefined;
    }
    default:
      return undefined;
  }
}

export const datalistId = (list: string) => `sugg-${list}`;
