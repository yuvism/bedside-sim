/**
 * Core engine types. Pure TypeScript with no runtime dependencies, so every
 * type here maps one-to-one onto a C# class in unity/.
 *
 * Units: HR /min, BP mmHg, SpO2 %, RR /min, EtCO2 mmHg, temp °C,
 * glucose mmol/L, blood gases kPa, lactate mmol/L, drug amounts in the
 * formulary unit for that drug, time in seconds unless a name says Min.
 */

export const RHYTHMS = [
  'sinus',
  'sinus_tachy',
  'sinus_brady',
  'af',
  'svt',
  'vt',
  'pvt',
  'vf',
  'pea',
  'asystole',
  'stemi',
] as const;
export type Rhythm = (typeof RHYTHMS)[number];

/** Rhythms with no cardiac output: these are cardiac arrest. */
export const NON_PERFUSING: readonly Rhythm[] = ['pvt', 'vf', 'pea', 'asystole'];

export const ROUTES = ['IM', 'IV', 'IO', 'NEB', 'INH', 'PO', 'SL', 'SC', 'IN'] as const;
export type Route = (typeof ROUTES)[number];

export const VITAL_KEYS = [
  'hr',
  'sbp',
  'dbp',
  'map',
  'spo2',
  'rr',
  'etco2',
  'temp',
  'gcs',
  'glucose',
] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];

export interface Vitals {
  /** Monitor heart rate (ECG-derived). Null when there is no organised rhythm (VF). */
  hr: number | null;
  /** Null when there is no cardiac output. */
  sbp: number | null;
  dbp: number | null;
  map: number | null;
  spo2: number | null;
  rr: number;
  etco2: number;
  temp: number;
  gcs: number;
  glucose: number;
  rhythm: Rhythm;
  /** Ventricular ectopy on top of the base rhythm. */
  ectopy: boolean;
}

/** Vascular access and invasive monitoring lines. */
export type AccessKind = 'iv' | 'io' | 'art';
export type Access = Record<AccessKind, boolean>;

/** Visible signs, each 0–1. Drives the avatar and some exam text. */
export type Signs = Record<string, number>;

// ---------------------------------------------------------------------------
// Conditions — a tiny, serialisable predicate language used across case data
// ---------------------------------------------------------------------------

export interface Range {
  gte?: number;
  lt?: number;
}

export type Condition =
  | ({ severity: string } & Range)
  | ({ vital: VitalKey } & Range)
  | ({ lab: string } & Range)
  | { time: Range }
  /** Given at all (by route if set), and at least `forSec` ago if set. */
  | { drugGiven: string; route?: Route; forSec?: number }
  /** An infusion of this drug is running. */
  | { infusing: string }
  /** Done at least `forSec` ago and/or less than `withinSec` ago. */
  | { procedure: string; forSec?: number; withinSec?: number }
  /** Current summed drug effect on a target, e.g. block:membrane. */
  | ({ effect: string } & Range)
  | { device: string }
  | { access: AccessKind | 'any' }
  | { arrest: boolean }
  | { cpr: boolean }
  | { ectopy: boolean }
  | { rhythm: Rhythm[] }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

// ---------------------------------------------------------------------------
// Library data: formulary, devices, investigations
// ---------------------------------------------------------------------------

/** Anything carrying a medical number cites its source; uncertain values are flagged. */
export interface Sourced {
  source?: string;
  reviewNeeded?: boolean;
}

/**
 * Effect targets (strings so they port cleanly):
 *   hr | sbp | dbp | rr | temp | glucose | gcs | etco2   additive vital offsets
 *   vq | shunt | ventLoss                                   gas-exchange terms
 *   lab:<key>  sign:<key>                                   lab and sign offsets
 *   process:<type>   (drugs only) change in severity per minute
 *   block:<group>    (drugs only) fraction 0–1 of a process effect group blocked
 * An `sbp` offset also moves DBP by the patient's baseline DBP/SBP ratio.
 */
export type EffectTarget = string;

export interface DrugEffect extends Sourced {
  target: EffectTarget;
  emax: number;
  /** Amount (in the drug's unit, normalised to 70 kg) giving half of emax. */
  ec50: number;
}

export interface FixedEffect {
  target: EffectTarget;
  value: number;
}

export interface TransientDef {
  /** Decay time constant. */
  tauMin: number;
  amplitude: number;
  effects: FixedEffect[];
  ectopy?: boolean;
}

export interface AdverseRule extends Sourced {
  id: string;
  /** Only applies to these routes (all routes when omitted). */
  routes?: Route[];
  /** Fires when given outside cardiac arrest. */
  whenNotArrest?: boolean;
  /** Fires when the previous dose by the same route was less than this many seconds ago. */
  repeatWithinSec?: number;
  /** Fires when a single dose is above this amount. */
  doseAbove?: number;
  level: 'warn' | 'danger';
  message: string;
  /** Spoken by the patient when the rule fires. */
  say?: string;
  transient?: TransientDef;
  /** Counts as a harmful action in scoring. */
  harm?: boolean;
}

export interface DrugRoute extends Sourced {
  route: Route;
  label: string;
  standardDose: number;
  minDose?: number;
  maxDose?: number;
  bioavailability: number;
  /** 0 = straight into the central compartment. */
  absorptionHalfLifeMin: number;
}

/** Continuous IV infusion. Rate is entered in `unit` and converted to drug amount per minute. */
export interface InfusionDef extends Sourced {
  /** Display unit for the rate, e.g. "mcg/kg/min", "units/kg/h", "mg/h". */
  unit: string;
  standardRate: number;
  minRate: number;
  maxRate: number;
  /** Rate unit uses body weight (per kg). */
  perKg: boolean;
  /** Drug amount (formulary unit) per minute for a rate of 1 (before × weight). */
  amountPerMinPerRate: number;
}

/** A situation where the drug should not be given; the nurse queries it and the engine flags it. */
export interface Contraindication extends Sourced {
  id: string;
  when: Condition;
  message: string;
  /** Counts as a harmful action if given anyway. */
  harm?: boolean;
}

export interface DrugDef extends Sourced {
  id: string;
  name: string;
  aliases?: string[];
  drugClass: string;
  unit: string;
  halfLifeMin: number;
  routes: DrugRoute[];
  infusion?: InfusionDef;
  effects: DrugEffect[];
  adverse?: AdverseRule[];
  /** Matched against the patient's allergies (e.g. "penicillin", "beta-lactam"). */
  allergyClasses?: string[];
  contraindications?: Contraindication[];
  /** Shown after giving it (hidden in exam mode). */
  feedback?: string;
}

/**
 * Vital/lab targets act through the volume still circulating. process:<type>
 * targets act as each millilitre goes in (severity change per litre infused).
 */
export interface FluidEffect {
  target: EffectTarget;
  perLitre: number;
  /** Circulating volume above this stops adding effect. */
  maxLitres?: number;
}

export interface FluidDef extends Sourced {
  id: string;
  name: string;
  standardVolumeMl: number;
  maxRateMlPerMin: number;
  /** How fast the extra volume leaves the circulation. */
  redistributionTauMin: number;
  effects: FluidEffect[];
}

export interface Formulary {
  version: number;
  drugs: DrugDef[];
  fluids: FluidDef[];
}

export interface DeviceDef extends Sourced {
  id: string;
  label: string;
  sub?: string;
  category: 'oxygen' | 'position' | 'airway' | 'monitoring';
  /** Assisted ventilation (BVM, ventilator): replaces this much lost ventilation and sets a minimum RR. */
  ventilation?: { support: number; minRr: number };
  /** Short label used in text templates, e.g. "15 L O₂". */
  short?: string;
  fio2?: number;
  effects?: FixedEffect[];
  onText: string;
  offText: string;
}

export interface ProcedureDef extends Sourced {
  id: string;
  label: string;
  sub?: string;
  category: 'access' | 'airway' | 'breathing' | 'circulation' | 'team';
  grants?: AccessKind;
  doneText: string;
  alreadyText?: string;
}

export interface DeviceTable {
  version: number;
  devices: DeviceDef[];
  procedures: ProcedureDef[];
}

export interface InvestigationDef extends Sourced {
  id: string;
  label: string;
  sub?: string;
  category: 'bedside' | 'lab' | 'imaging';
  turnaroundMin: number;
}

export interface InvestigationTable {
  version: number;
  investigations: InvestigationDef[];
}

export interface EngineLibrary {
  formulary: Formulary;
  devices: DeviceTable;
  investigations: InvestigationTable;
}

export type { CaseDef } from './caseTypes.ts';

// ---------------------------------------------------------------------------
// Actions and events
// ---------------------------------------------------------------------------

export type Action =
  | { kind: 'drug'; drugId: string; route: Route; dose: number }
  /** Start, change or (rate 0) stop an infusion; rate in the drug's infusion unit. */
  | { kind: 'infusion'; drugId: string; rate: number }
  | { kind: 'cpr'; on: boolean }
  | { kind: 'shock'; joules: number }
  | { kind: 'pulse_check' }
  | { kind: 'fluid'; fluidId: string; volumeMl: number }
  | { kind: 'device'; deviceId: string; on: boolean }
  | { kind: 'procedure'; procedureId: string }
  | { kind: 'talk'; questionId: string }
  | { kind: 'exam'; examId: string }
  | { kind: 'order'; investigationId: string }
  | { kind: 'diagnosis'; diagnosisId: string }
  | { kind: 'call_help' };

export type SimEventType =
  | 'action'
  | 'patient'
  | 'finding'
  | 'result'
  | 'system'
  | 'warn'
  | 'danger'
  | 'outcome'
  /** The nurse: read-backs, queries, completed tasks and prompts. */
  | 'nurse';

export interface SimEvent {
  /** Sim time in whole seconds. */
  t: number;
  type: SimEventType;
  /** Machine-readable, used by scoring: e.g. drug:adrenaline:IM, exam:A, arrest, rosc. */
  code: string;
  text: string;
  data?: Record<string, string | number | boolean>;
}

/** Terminal outcomes. Cardiac arrest is not one: the clinician can still get ROSC. */
export type Outcome = 'stabilised' | 'died';

// ---------------------------------------------------------------------------
// Serialisable engine state
// ---------------------------------------------------------------------------

export interface ProcessState {
  id: string;
  severity: number;
  /** Seeded multiplier on the progression rate. */
  rateMul: number;
  /** Seeded multiplier on how strongly treatments act. */
  sensitivity: number;
}

export interface DoseRecord {
  t: number;
  route: Route;
  dose: number;
}

export interface DrugState {
  drugId: string;
  depots: { route: Route; amount: number }[];
  central: number;
  doses: DoseRecord[];
  /** Running infusion rate in the drug's infusion unit (0 = off). */
  infusionRate: number;
}

export interface FluidState {
  fluidId: string;
  pendingMl: number;
  circulatingMl: number;
  totalMl: number;
}

export interface TransientState extends TransientDef {
  sourceId: string;
}

export interface OrderState {
  investigationId: string;
  orderedT: number;
  dueT: number;
  text: string;
  reported: boolean;
}

export interface BaselineState {
  hr: number;
  sbp: number;
  dbp: number;
  rr: number;
}

export interface ArrestState {
  /** When this arrest began. */
  t0: number;
  /** Seconds of CPR delivered during this arrest. */
  cprSec: number;
  shocks: number;
  /** Seconds of CPR since the last rhythm/pulse check. */
  cprSinceCheck: number;
}

export interface EngineState {
  caseId: string;
  seed: number;
  t: number;
  /** Fractional seconds waiting for the next fixed 1 s tick. */
  acc: number;
  rng: number;
  baseline: BaselineState;
  processes: ProcessState[];
  drugs: DrugState[];
  fluids: FluidState[];
  transients: TransientState[];
  devices: string[];
  access: Access;
  noise: Record<string, number>;
  rhythm: Rhythm;
  arrest: boolean;
  arrestT: number | null;
  als: ArrestState | null;
  cpr: boolean;
  arrests: number;
  /** Procedure id → time it was done. */
  procedures: Record<string, number>;
  linesFired: string[];
  stableForSec: number;
  outcome: Outcome | null;
  orders: OrderState[];
  helpCalled: boolean;
  diagnosis: string | null;
}
