/**
 * "Add what's missing": compares what happened in a reference video with
 * what the case knows about, and proposes additions. Nothing is applied
 * until a person approves it (applyUpdate).
 */
import type { CaseDef, RuleTest, ScoringRule } from '../caseTypes.ts';
import { codeMatches } from '../scoring.ts';
import type { Condition, EngineLibrary } from '../types.ts';
import type { MappedEvent } from '../validation/events.ts';
import { setAt } from './tunables.ts';
import type { ParamChange } from './fit.ts';

export type Addition =
  | { kind: 'scoring'; id: string; rule: ScoringRule; because: string }
  | {
      kind: 'hint';
      id: string;
      hint: { id: string; text: string; when?: Condition };
      because: string;
    }
  | {
      kind: 'patientLine';
      id: string;
      line: { id: string; text: string; when: Condition };
      because: string;
    }
  | {
      kind: 'investigation';
      id: string;
      investigation: { id: string; results: { text: string }[] };
      because: string;
    }
  /** Needs a change to the shared library (formulary, devices…): reported, not applied. */
  | { kind: 'library'; id: string; t: number; text: string; because: string };

/** Result templates built from live engine values, so nothing is invented. */
const RESULT_TEMPLATES: Record<string, string> = {
  abg: 'pH {ph:2}, PaO₂ {pao2:1} kPa on {o2}, PaCO₂ {paco2:1} kPa, HCO₃⁻ {hco3:1} mmol/L, lactate {lactate:1} mmol/L.',
  vbg: 'pH {ph:2}, PCO₂ {paco2:1} kPa, HCO₃⁻ {hco3:1} mmol/L, K⁺ {k:1} mmol/L, lactate {lactate:1} mmol/L, glucose {glucose:1} mmol/L.',
  glu: 'Capillary glucose {glucose:1} mmol/L.',
  ue: 'Na⁺ {na} mmol/L, K⁺ {k:1} mmol/L, urea {urea:1} mmol/L, creatinine {creatinine} µmol/L.',
};

const NOT_SCORED = /^(talk|exam):/;

function ruleCodes(t: RuleTest): string[] {
  switch (t.type) {
    case 'actionDone':
    case 'actionWithin':
    case 'actionNever':
    case 'actionCount':
      return t.codes;
    case 'actionBefore':
      return [...t.codes, ...t.before];
    case 'all':
    case 'any':
      return t.tests.flatMap(ruleCodes);
    case 'not':
      return ruleCodes(t.test);
    default:
      return [];
  }
}

const slug = (s: string) =>
  s
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

function actionLabel(lib: EngineLibrary, code: string): string {
  const [kind = '', id = '', route] = code.split(':');
  if (kind === 'drug') {
    const d = lib.formulary.drugs.find((x) => x.id === id);
    return `${d?.name ?? id}${route ? ` ${route}` : ''}`;
  }
  if (kind === 'infusion')
    return `${lib.formulary.drugs.find((x) => x.id === id)?.name ?? id} infusion`;
  if (kind === 'fluid') return `${lib.formulary.fluids.find((x) => x.id === id)?.name ?? id} bolus`;
  if (kind === 'device') return lib.devices.devices.find((x) => x.id === id)?.label ?? id;
  if (kind === 'procedure') return lib.devices.procedures.find((x) => x.id === id)?.label ?? id;
  if (kind === 'order')
    return lib.investigations.investigations.find((x) => x.id === id)?.label ?? id;
  if (kind === 'help') return 'Called for help';
  if (kind === 'shock') return 'Defibrillation';
  if (kind === 'cpr') return 'CPR';
  return code;
}

/** Scoring patterns: drugs match any route the guideline allows. */
const scorePattern = (code: string) =>
  code.startsWith('drug:') ? code.split(':').slice(0, 2).join(':') + ':*' : code;

export interface ProposeInput {
  lib: EngineLibrary;
  caseDef: CaseDef;
  events: readonly MappedEvent[];
  /** Severity of the case's banding process at a reference time (from the fitted run). */
  severityAt(t: number): number | null;
  referenceName: string;
}

export function proposeAdditions(p: ProposeInput): Addition[] {
  const { lib, caseDef: c } = p;
  const out: Addition[] = [];
  const seen = new Set<string>();
  const covered = c.scoring.flatMap((r) => ruleCodes(r.test));
  const proc = c.bands.process;
  const known = new Set([
    ...(c.hints ?? []).map((h) => h.text),
    ...c.patientLines.map((l) => l.text),
  ]);

  for (const e of p.events) {
    if (e.code && e.action) {
      const code = e.code;
      if (code.startsWith('order:')) {
        const inv = code.slice('order:'.length);
        const tpl = RESULT_TEMPLATES[inv];
        if (tpl && !c.investigations.some((i) => i.id === inv) && !seen.has(`inv:${inv}`)) {
          seen.add(`inv:${inv}`);
          out.push({
            kind: 'investigation',
            id: `inv:${inv}`,
            investigation: { id: inv, results: [{ text: tpl }] },
            because: `The video orders ${actionLabel(lib, code)} at ${fmt(e.t)}, but the case has no result for it.`,
          });
        }
      }
      if (NOT_SCORED.test(code) || covered.some((pat) => codeMatches(pat, code))) continue;
      const pattern = scorePattern(code);
      const id = `video-${slug(pattern.replace(/:\*$/, ''))}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        kind: 'scoring',
        id,
        rule: {
          id,
          label: `${actionLabel(lib, code)} (done by the team in the reference video)`,
          weight: 5,
          kind: 'credit',
          domain: 'management',
          test: { type: 'actionDone', codes: [pattern] },
        },
        because: `The video team did this at ${fmt(e.t)}; no scoring rule credits it yet.`,
      });
      continue;
    }
    const isAnnotation = (e.note ?? '').startsWith('Annotation');
    if (!isAnnotation) {
      out.push({
        kind: 'library',
        id: `lib:${e.t}:${e.raw}`,
        t: e.t,
        text: e.raw,
        because: e.note ?? 'Not recognised.',
      });
      continue;
    }
    const sev = p.severityAt(e.t);
    const when: Condition | undefined =
      sev === null ? undefined : { severity: proc, gte: Math.max(0, Math.floor(sev) - 2) };
    const text = e.raw.trim();
    if (known.has(text)) continue;
    const n = out.length + 1;
    if (/^(patient|says|")/i.test(text)) {
      const lineText = text.replace(/^(patient\s*(says)?:?|says:?)\s*/i, '').replace(/^"|"$/g, '');
      out.push({
        kind: 'patientLine',
        id: `line:${n}`,
        line: { id: `video-line-${n}`, text: lineText, when: when ?? { severity: proc, gte: 0 } },
        because: `Something the patient says in the video at ${fmt(e.t)}.`,
      });
    } else {
      out.push({
        kind: 'hint',
        id: `hint:${n}`,
        hint: when ? { id: `video-hint-${n}`, text, when } : { id: `video-hint-${n}`, text },
        because: `A teaching moment in the video at ${fmt(e.t)}; shown as a guided-mode prompt.`,
      });
    }
  }
  return out;
}

function fmt(t: number): string {
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface ApplyInput {
  /** The case JSON to start from (left untouched). */
  base: CaseDef;
  changes: readonly ParamChange[];
  additions: readonly Addition[];
  newId: string;
  newTitle: string;
  referenceName: string;
  /** e.g. 2026-11-11, passed in so the engine stays free of clocks. */
  date: string;
}

/** Builds the updated case: fitted values in place, additions appended, all flagged for review. */
export function applyUpdate(a: ApplyInput): CaseDef {
  const c = structuredClone(a.base);
  c.id = a.newId;
  c.title = a.newTitle;
  c.version = 1;
  const note = `Fitted to "${a.referenceName}" on ${a.date} with Learn from a video. Check before use.`;
  const touched = new Set<number>();
  for (const ch of a.changes) {
    setAt(c, ch.tunable.path, Number(ch.after.toPrecision(4)));
    if (ch.tunable.path[0] === 'processes') touched.add(ch.tunable.path[1] as number);
    if (ch.tunable.path[0] === 'baseline') {
      c.baseline.source = [c.baseline.source, note].filter(Boolean).join(' ');
      c.baseline.reviewNeeded = true;
    }
  }
  for (const i of touched) {
    const p = c.processes[i];
    if (!p) continue;
    p.source = [p.source, note].filter(Boolean).join(' ');
    p.reviewNeeded = true;
  }
  for (const add of a.additions) {
    if (add.kind === 'scoring') c.scoring.push(add.rule);
    else if (add.kind === 'hint') (c.hints ??= []).push(add.hint);
    else if (add.kind === 'patientLine') c.patientLines.push(add.line);
    else if (add.kind === 'investigation') c.investigations.push(add.investigation);
  }
  return c;
}
