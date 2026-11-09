/**
 * The shape of a case file (src/content/cases/*.json). Validated at runtime by
 * src/content/schema.ts, which is type-checked against these interfaces.
 */
import type { Condition, Rhythm, Sourced, VitalKey } from './types.ts';

export interface PatientInfo {
  name: string;
  age: number;
  sex: 'male' | 'female';
  weightKg: number;
  occupation?: string;
  /** How they talk and behave; also feeds the optional AI patient prompt. */
  persona: string;
  /** Drug allergy classes, matched against formulary allergyClasses (e.g. "penicillin"). */
  allergies?: string[];
}

/** Physiology at severity 0. Gas-exchange terms are optional with healthy defaults. */
export interface Baseline extends Sourced {
  hr: number;
  sbp: number;
  dbp: number;
  rr: number;
  temp: number;
  glucose: number;
  /** kPa */
  paco2?: number;
  shunt?: number;
  /** Alveolar–arterial gradient from V/Q mismatch, kPa. */
  vq?: number;
  svo2?: number;
  /** ± range for seeded variation. */
  hrJitter?: number;
  sbpJitter?: number;
}

export interface ProcessEffect {
  target: string;
  /** Change per severity point above `above`. */
  perPoint: number;
  above?: number;
  /** Curve: effect = perPoint × (severity − above)^exponent. Default 1. */
  exponent?: number;
  /** Treatments with block:<group> reduce this effect. */
  group?: string;
}

/** A non-drug treatment: while `when` holds, severity changes by ratePerMin. */
export interface ProcessTreatment extends Sourced {
  id: string;
  when: Condition;
  ratePerMin: number;
}

export interface ProcessDef extends Sourced {
  id: string;
  /** Matched by drug effects targeting process:<type>. */
  type: string;
  label: string;
  initial: number;
  initialJitter?: number;
  /** Severity points per minute at t = 0. */
  ratePerMin: number;
  rateJitterPct?: number;
  /** The drive decays as e^(−t/τ). Omit for a constant drive. */
  decayTauMin?: number;
  /** First-order spontaneous recovery, per minute. */
  recoveryPerMin?: number;
  /** ± % variation in how strongly treatments act. */
  sensitivityJitterPct?: number;
  /** Severity at which the patient arrests. */
  arrestAt?: number;
  arrestRhythm?: Rhythm;
  effects: ProcessEffect[];
  treatments?: ProcessTreatment[];
}

export interface TextVariant {
  when?: Condition;
  text: string;
}

export const TALK_CATEGORIES = [
  'presenting',
  'history',
  'pmh',
  'meds',
  'allergies',
  'social',
  'family',
  'ice',
] as const;
export type TalkCategory = (typeof TALK_CATEGORIES)[number];

export interface DialogueEntry {
  id: string;
  category: TalkCategory;
  q: string;
  /** One answer per severity band. Text in (brackets) is non-verbal. */
  a: string[];
  keywords?: string[];
}

export interface ExamEntry {
  id: string;
  label: string;
  /** abcde entries run in order; region entries map to the body diagram. */
  kind: 'abcde' | 'region';
  region?: string;
  findings: TextVariant[];
}

export interface CaseInvestigation {
  id: string;
  /** Logged when ordered (e.g. "Sample sent"). */
  orderNote?: string;
  results: TextVariant[];
}

export interface PatientLine {
  id: string;
  when: Condition;
  text: string;
}

export interface RhythmRule extends Sourced {
  id: string;
  from?: Rhythm[];
  to: Rhythm;
  when: Condition;
  /** Chance per minute while the condition holds. Omit for an immediate change. */
  probPerMin?: number;
}

export interface Bands {
  process: string;
  /** Severity cut-offs; band index = number of cut-offs at or below severity. */
  cutoffs: number[];
}

// ---------------------------------------------------------------------------
// Scoring (evaluated in src/engine/scoring.ts)
// ---------------------------------------------------------------------------

export type RuleTest =
  | { type: 'actionDone'; codes: string[] }
  | { type: 'actionWithin'; codes: string[]; withinSec: number }
  | { type: 'actionBefore'; codes: string[]; before: string[] }
  | { type: 'actionNever'; codes: string[] }
  | { type: 'actionCount'; codes: string[]; min?: number; max?: number }
  | { type: 'examined'; ids: string[]; min?: number }
  | { type: 'asked'; ids: string[]; min?: number }
  | { type: 'diagnosisIs'; ids: string[] }
  | { type: 'outcomeIs'; outcomes: string[] }
  | { type: 'vitalNeverBelow'; vital: VitalKey; value: number }
  | { type: 'vitalNeverAbove'; vital: VitalKey; value: number }
  | { type: 'rulePassed'; id: string }
  | { type: 'ruleFailed'; id: string }
  | { type: 'all'; tests: RuleTest[] }
  | { type: 'any'; tests: RuleTest[] }
  | { type: 'not'; test: RuleTest };

/** OSCE-style domains for the exam-mode breakdown. */
export const SCORE_DOMAINS = ['assessment', 'diagnosis', 'management', 'safety'] as const;
export type ScoreDomain = (typeof SCORE_DOMAINS)[number];

export interface ScoringRule {
  id: string;
  label: string;
  /** Inferred from the test type when omitted. */
  domain?: ScoreDomain;
  /** Points gained when passed (credit) or lost when failed (penalty). */
  weight: number;
  kind: 'credit' | 'penalty';
  /** A failed critical rule caps the score and is flagged in the debrief. */
  critical?: boolean;
  test: RuleTest;
}

export interface TeachingPoint {
  id: string;
  text: string;
  showIf?: RuleTest;
}

export interface Reference {
  id: string;
  label: string;
  url?: string;
}

export interface CaseDef {
  schemaVersion: 1;
  id: string;
  version: number;
  title: string;
  summary: string;
  specialty: string;
  difficulty: 'foundation' | 'core' | 'advanced';
  estMinutes: number;
  tags?: string[];
  patient: PatientInfo;
  brief: string[];
  openingLine: string;
  baseline: Baseline;
  labs: Record<string, number>;
  processes: ProcessDef[];
  bands: Bands;
  dialogue: DialogueEntry[];
  exam: ExamEntry[];
  investigations: CaseInvestigation[];
  patientLines: PatientLine[];
  rhythmRules?: RhythmRule[];
  outcomes: {
    stabilised: { when: Condition; forSec: number; text: string };
    /** Death after this long in continuous cardiac arrest (default 900 s). */
    maxArrestSec?: number;
  };
  diagnosis: { correct: string[]; options: { id: string; label: string }[] };
  scoring: ScoringRule[];
  teaching: TeachingPoint[];
  references: Reference[];
  /** Guided-mode prompts from the nurse, shown after a spell with no action. */
  hints?: Hint[];
  /** Seeded variations applied when a session starts. */
  variation?: Variation;
}

export interface Hint {
  id: string;
  /** Only offered while this holds. */
  when?: Condition;
  text: string;
}

export interface VariationOption {
  id: string;
  label: string;
  /** Probability 0–1 that this option applies. */
  chance: number;
  allergies?: string[];
  /** Replacement answers (one per band) by dialogue id: moves or hides the key clue. */
  answers?: Record<string, string[]>;
  /** Offsets to the baseline physiology. */
  baseline?: { hr?: number; sbp?: number; rr?: number; temp?: number };
  /** Added to every process's starting severity. */
  severity?: number;
}

export interface Variation {
  ageRange?: [number, number];
  weightKgRange?: [number, number];
  options?: VariationOption[];
}
