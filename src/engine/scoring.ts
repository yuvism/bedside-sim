/**
 * Rule-based scoring. Evaluates a case's scoring rules and teaching points
 * against a finished run (its event log, vitals trace, outcome, diagnosis).
 *
 * Credit rules add their weight when passed. Penalty rules subtract their
 * weight when failed. A failed critical rule caps the final percentage.
 */
import {
  SCORE_DOMAINS,
  type CaseDef,
  type RuleTest,
  type ScoreDomain,
  type ScoringRule,
  type TeachingPoint,
} from './caseTypes.ts';
import type { TraceRow } from './recorder.ts';
import type { SimEvent, VitalKey } from './types.ts';

/** A failed critical rule caps the percentage at this value. */
export const CRITICAL_CAP = 40;
/** Exam mode: pass needs at least this percentage and no failed critical rule. */
export const PASS_MARK = 60;

export interface RunRecord {
  events: readonly SimEvent[];
  trace: readonly TraceRow[];
  /** 'stabilised' | 'arrest' | 'ended' */
  outcome: string;
  diagnosis: string | null;
}

export type RuleStatus = 'done' | 'missed' | 'harmful' | 'avoided';

export interface RuleResult {
  id: string;
  label: string;
  kind: ScoringRule['kind'];
  weight: number;
  critical: boolean;
  passed: boolean;
  /** Points this rule contributed: +weight, −weight or 0. */
  points: number;
  status: RuleStatus;
  /** First matching event time, when the rule is about an action. */
  firstT: number | null;
  /** e.g. "4/5" for examined/asked rules. */
  detail: string | null;
  domain: ScoreDomain;
}

export interface ScoreResult {
  /** 0–100 after any critical cap. */
  percent: number;
  raw: number;
  max: number;
  capped: boolean;
  results: RuleResult[];
  teaching: TeachingPoint[];
  /** OSCE-style breakdown: points earned out of available credit per domain. */
  domains: Record<ScoreDomain, { earned: number; max: number }>;
  pass: boolean;
}

const ASSESSMENT_PREFIXES = ['order:', 'talk:', 'exam:', 'monitor:'];

/** The rule's domain, inferred from its test when the case doesn't set one. */
export function domainOf(rule: ScoringRule): ScoreDomain {
  if (rule.domain) return rule.domain;
  if (rule.kind === 'penalty') return 'safety';
  const t = rule.test;
  if (t.type === 'examined' || t.type === 'asked') return 'assessment';
  if (t.type === 'diagnosisIs') return 'diagnosis';
  if ('codes' in t && t.codes.every((c) => ASSESSMENT_PREFIXES.some((p) => c.startsWith(p)))) {
    return 'assessment';
  }
  return 'management';
}

/** Glob match for event codes: `*` matches any run of characters. */
export function codeMatches(pattern: string, code: string): boolean {
  if (!pattern.includes('*')) return pattern === code;
  const re = new RegExp(
    `^${pattern
      .split('*')
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );
  return re.test(code);
}

const anyMatch = (patterns: readonly string[], code: string) =>
  patterns.some((p) => codeMatches(p, code));

function firstIndex(events: readonly SimEvent[], patterns: readonly string[]): number {
  return events.findIndex((e) => anyMatch(patterns, e.code));
}

function vitalValues(trace: readonly TraceRow[], key: VitalKey): (number | null)[] {
  return trace.map((r) => (key in r ? (r[key as keyof TraceRow] as number | null) : null));
}

class Evaluator {
  private readonly cache = new Map<string, boolean>();
  private readonly inProgress = new Set<string>();
  private readonly rules: Map<string, ScoringRule>;
  private readonly run: RunRecord;

  constructor(rules: readonly ScoringRule[], run: RunRecord) {
    this.rules = new Map(rules.map((r) => [r.id, r]));
    this.run = run;
  }

  rule(id: string): boolean {
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit;
    const r = this.rules.get(id);
    if (!r || this.inProgress.has(id)) return false;
    this.inProgress.add(id);
    const v = this.test(r.test);
    this.inProgress.delete(id);
    this.cache.set(id, v);
    return v;
  }

  test(t: RuleTest): boolean {
    const { events, trace } = this.run;
    switch (t.type) {
      case 'actionDone':
        return firstIndex(events, t.codes) >= 0;
      case 'actionWithin': {
        const i = firstIndex(events, t.codes);
        return i >= 0 && (events[i]?.t ?? Infinity) <= t.withinSec;
      }
      case 'actionBefore': {
        const a = firstIndex(events, t.codes);
        const b = firstIndex(events, t.before);
        return a >= 0 && (b < 0 || a < b);
      }
      case 'actionNever':
        return firstIndex(events, t.codes) < 0;
      case 'actionCount': {
        const n = events.filter((e) => anyMatch(t.codes, e.code)).length;
        return n >= (t.min ?? 0) && n <= (t.max ?? Infinity);
      }
      case 'examined':
      case 'asked': {
        const prefix = t.type === 'examined' ? 'exam:' : 'talk:';
        const done = t.ids.filter((id) => events.some((e) => e.code === prefix + id)).length;
        return done >= (t.min ?? t.ids.length);
      }
      case 'diagnosisIs':
        return this.run.diagnosis !== null && t.ids.includes(this.run.diagnosis);
      case 'outcomeIs':
        return t.outcomes.includes(this.run.outcome);
      case 'vitalNeverBelow':
        // A missing value (no output in arrest) counts as below.
        return vitalValues(trace, t.vital).every((v) => v !== null && v >= t.value);
      case 'vitalNeverAbove':
        return vitalValues(trace, t.vital).every((v) => v === null || v <= t.value);
      case 'rulePassed':
        return this.rule(t.id);
      case 'ruleFailed':
        return !this.rule(t.id);
      case 'all':
        return t.tests.every((x) => this.test(x));
      case 'any':
        return t.tests.some((x) => this.test(x));
      case 'not':
        return !this.test(t.test);
    }
  }
}

function firstT(run: RunRecord, t: RuleTest): number | null {
  if (t.type === 'actionDone' || t.type === 'actionWithin' || t.type === 'actionCount') {
    const i = firstIndex(run.events, t.codes);
    return i >= 0 ? (run.events[i]?.t ?? null) : null;
  }
  return null;
}

function detail(run: RunRecord, t: RuleTest): string | null {
  if (t.type === 'examined' || t.type === 'asked') {
    const prefix = t.type === 'examined' ? 'exam:' : 'talk:';
    const done = t.ids.filter((id) => run.events.some((e) => e.code === prefix + id)).length;
    return `${done}/${t.ids.length}`;
  }
  if (t.type === 'actionCount') {
    return String(run.events.filter((e) => anyMatch(t.codes, e.code)).length);
  }
  return null;
}

export function scoreRun(c: Pick<CaseDef, 'scoring' | 'teaching'>, run: RunRecord): ScoreResult {
  const ev = new Evaluator(c.scoring, run);
  const results: RuleResult[] = c.scoring.map((r) => {
    const passed = ev.rule(r.id);
    const credit = r.kind === 'credit';
    const points = credit ? (passed ? r.weight : 0) : passed ? 0 : -r.weight;
    const status: RuleStatus = credit
      ? passed
        ? 'done'
        : 'missed'
      : passed
        ? 'avoided'
        : 'harmful';
    return {
      id: r.id,
      label: r.label,
      kind: r.kind,
      weight: r.weight,
      critical: !!r.critical,
      passed,
      points,
      status,
      firstT: firstT(run, r.test),
      detail: detail(run, r.test),
      domain: domainOf(r),
    };
  });
  const max = c.scoring.filter((r) => r.kind === 'credit').reduce((s, r) => s + r.weight, 0);
  const raw = Math.max(
    0,
    results.reduce((s, r) => s + r.points, 0),
  );
  let percent = max > 0 ? Math.round((100 * raw) / max) : 0;
  const capped = results.some((r) => r.critical && !r.passed) && percent > CRITICAL_CAP;
  if (capped) percent = CRITICAL_CAP;
  const teaching = c.teaching.filter((tp) => !tp.showIf || ev.test(tp.showIf));
  const domains = Object.fromEntries(
    SCORE_DOMAINS.map((d) => [d, { earned: 0, max: 0 }]),
  ) as ScoreResult['domains'];
  for (const r of results) {
    const d = domains[r.domain];
    if (r.kind === 'credit') d.max += r.weight;
    d.earned += r.points;
  }
  const criticalFail = results.some((r) => r.critical && !r.passed);
  const pass = percent >= PASS_MARK && !criticalFail;
  return { percent, raw, max, capped, results, teaching, domains, pass };
}

/** Final diagnosis = the last working diagnosis chosen during the run. */
export function lastDiagnosis(events: readonly SimEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const code = events[i]?.code ?? '';
    if (code.startsWith('dx:')) return code.slice(3);
  }
  return null;
}
