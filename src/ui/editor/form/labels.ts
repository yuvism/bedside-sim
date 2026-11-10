/**
 * Human labels, help text and input hints for case-schema field names.
 * Anything not listed falls back to a readable version of the key.
 */

const LABELS: Record<string, string> = {
  schemaVersion: 'Schema version',
  id: 'ID',
  estMinutes: 'Estimated minutes',
  weightKg: 'Weight (kg)',
  openingLine: 'Opening line',
  hr: 'Heart rate',
  sbp: 'Systolic BP',
  dbp: 'Diastolic BP',
  rr: 'Respiratory rate',
  temp: 'Temperature (°C)',
  glucose: 'Glucose (mmol/L)',
  paco2: 'PaCO₂ (kPa)',
  shunt: 'Shunt fraction',
  vq: 'V/Q gradient (kPa)',
  svo2: 'SvO₂',
  hrJitter: 'Heart rate jitter',
  sbpJitter: 'Systolic BP jitter',
  ratePerMin: 'Rate per minute',
  rateJitterPct: 'Rate jitter (%)',
  decayTauMin: 'Drive decay time constant (min)',
  recoveryPerMin: 'Recovery per minute',
  sensitivityJitterPct: 'Treatment sensitivity jitter (%)',
  initialJitter: 'Initial jitter',
  arrestAt: 'Arrest at severity',
  arrestRhythm: 'Arrest rhythm',
  perPoint: 'Change per severity point',
  above: 'Only above severity',
  q: 'Question',
  a: 'Answers (one per severity band, mildest first)',
  forSec: 'For (seconds)',
  withinSec: 'Within (seconds)',
  maxArrestSec: 'Maximum arrest time (s)',
  gte: 'At least',
  lt: 'Below',
  probPerMin: 'Probability per minute',
  showIf: 'Show if',
  reviewNeeded: 'Needs clinical review',
  ageRange: 'Age range',
  weightKgRange: 'Weight range (kg)',
  orderNote: 'Note when ordered',
  patientLines: 'Patient lines',
  rhythmRules: 'Rhythm rules',
  url: 'URL',
  ids: 'IDs',
  codes: 'Action codes',
  before: 'Before these actions',
};

const HELP: Record<string, string> = {
  id: 'Letters, digits, - and _ only.',
  when: 'A condition: when this applies.',
  codes:
    'Action codes, for example drug:adrenaline:IM, order:glu, talk:allergy, exam:A, device:o2_nrb:on, procedure:iv_access. * matches anything.',
  target:
    'A vital (hr, sbp, dbp, rr, temp, glucose, gcs, etco2, vq, shunt, ventLoss), lab:<name> or sign:<name>.',
  cutoffs: 'Severity values where the patient moves to the next band (for answers and exam text).',
  a: 'Text in (brackets) is something the patient does rather than says.',
  text: 'Placeholders such as {hr} or {glucose:1} are filled with live values.',
  group: 'Effects in the same group can be blocked together by a drug.',
  chance: 'Between 0 and 1.',
  source: 'Where this value comes from. Never invent a citation.',
  answers: 'Replacement answers by question id, one per severity band.',
};

/** Fields shown as a multi-line text box. */
const LONG = new Set(['text', 'persona', 'summary', 'openingLine', 'source', 'brief', 'a', 'q']);

export function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key];
  if (/^\d+$/.test(key)) return `Item ${Number(key) + 1}`;
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const helpFor = (key: string): string | undefined => HELP[key];

export const isLongText = (key: string): boolean => LONG.has(key);

/** Friendly names for the condition types (a plain union keyed by its first field). */
export const CONDITION_LABELS: Record<string, string> = {
  severity: 'Process severity',
  vital: 'Vital sign',
  lab: 'Lab value',
  time: 'Time since start',
  drugGiven: 'Drug given',
  infusing: 'Infusion running',
  procedure: 'Procedure done',
  effect: 'Drug effect level',
  device: 'Device on',
  access: 'Vascular access',
  arrest: 'In cardiac arrest',
  cpr: 'CPR running',
  ectopy: 'Ventricular ectopy',
  rhythm: 'Rhythm is one of',
  all: 'All of',
  any: 'Any of',
  not: 'Not',
};

/** What one item of a list is called, for its "+ Add" button. */
const SINGULAR: Record<string, string> = {
  processes: 'process',
  rhythmRules: 'rhythm rule',
  patientLines: 'patient line',
  dialogue: 'question',
  exam: 'examination',
  scoring: 'rule',
  teaching: 'teaching point',
  brief: 'paragraph',
  a: 'answer',
  allergies: 'allergy',
  ids: 'id',
  tests: 'test',
  findings: 'finding',
  results: 'result',
  options: 'option',
  correct: 'diagnosis',
  outcomes: 'outcome',
  rhythm: 'rhythm',
  from: 'rhythm',
  all: 'condition',
  any: 'condition',
};

export function singularFor(key: string): string {
  if (SINGULAR[key]) return SINGULAR[key];
  const words = labelFor(key).toLowerCase();
  if (words.endsWith('ies')) return `${words.slice(0, -3)}y`;
  return words.endsWith('s') ? words.slice(0, -1) : words;
}

/** Short summary for a collapsed list item. */
export function itemSummary(value: unknown, index: number): string {
  if (typeof value !== 'object' || value === null) return `Item ${index + 1}`;
  const v = value as Record<string, unknown>;
  if (typeof v['target'] === 'string' && typeof v['perPoint'] === 'number') {
    const above = typeof v['above'] === 'number' ? ` above ${v['above']}` : '';
    return `${v['target']}: ${v['perPoint'] >= 0 ? '+' : ''}${v['perPoint']} per point${above}`;
  }
  for (const k of ['label', 'q', 'text', 'name', 'id', 'target', 'type']) {
    const x = v[k];
    if (typeof x === 'string' && x.trim()) {
      const s = x.length > 70 ? `${x.slice(0, 67)}…` : x;
      return typeof v['id'] === 'string' && k !== 'id' && v['id'] ? `${v['id']}: ${s}` : s;
    }
  }
  return `Item ${index + 1}`;
}
