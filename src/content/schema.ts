/**
 * Zod schemas for every content file. Each schema is checked against the
 * engine's hand-written interfaces with `satisfies`, so they can't drift.
 */
import { z } from 'zod';
import type { RuleTest } from '../engine/caseTypes.ts';
import { TALK_CATEGORIES } from '../engine/caseTypes.ts';
import {
  RHYTHMS,
  ROUTES,
  VITAL_KEYS,
  type CaseDef,
  type Condition,
  type DeviceTable,
  type Formulary,
  type InvestigationTable,
} from '../engine/types.ts';

const sourced = { source: z.string().min(1).optional(), reviewNeeded: z.boolean().optional() };
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'ids use letters, digits, - and _ only');
const text = z.string().min(1);
const range = { gte: z.number().optional(), lt: z.number().optional() };

export const RhythmSchema = z.enum(RHYTHMS);
export const RouteSchema = z.enum(ROUTES);
export const VitalKeySchema = z.enum(VITAL_KEYS);

const PHYS = 'hr|sbp|dbp|rr|temp|glucose|gcs|etco2|vq|shunt|ventLoss';
const effectTarget = z
  .string()
  .regex(new RegExp(`^(${PHYS}|(lab|sign):[A-Za-z0-9_]+)$`), 'unknown effect target');
const drugTarget = z
  .string()
  .regex(
    new RegExp(`^(${PHYS}|(lab|sign|process|block):[A-Za-z0-9_]+)$`),
    'unknown drug effect target',
  );

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ severity: z.string(), ...range }),
    z.strictObject({ vital: VitalKeySchema, ...range }),
    z.strictObject({ lab: z.string(), ...range }),
    z.strictObject({ time: z.strictObject(range) }),
    z.strictObject({ drugGiven: z.string(), route: RouteSchema.optional() }),
    z.strictObject({ device: z.string() }),
    z.strictObject({ access: z.enum(['iv', 'io', 'any']) }),
    z.strictObject({ arrest: z.boolean() }),
    z.strictObject({ ectopy: z.boolean() }),
    z.strictObject({ rhythm: z.array(RhythmSchema).min(1) }),
    z.strictObject({ all: z.array(ConditionSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionSchema).min(1) }),
    z.strictObject({ not: ConditionSchema }),
  ]),
);

const codes = z.array(z.string().min(1)).min(1);
export const RuleTestSchema: z.ZodType<RuleTest> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('actionDone'), codes }),
    z.strictObject({ type: z.literal('actionWithin'), codes, withinSec: z.number().positive() }),
    z.strictObject({ type: z.literal('actionBefore'), codes, before: codes }),
    z.strictObject({ type: z.literal('actionNever'), codes }),
    z.strictObject({
      type: z.literal('actionCount'),
      codes,
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    }),
    z.strictObject({
      type: z.literal('examined'),
      ids: codes,
      min: z.number().int().optional(),
    }),
    z.strictObject({ type: z.literal('asked'), ids: codes, min: z.number().int().optional() }),
    z.strictObject({ type: z.literal('diagnosisIs'), ids: codes }),
    z.strictObject({ type: z.literal('outcomeIs'), outcomes: codes }),
    z.strictObject({
      type: z.literal('vitalNeverBelow'),
      vital: VitalKeySchema,
      value: z.number(),
    }),
    z.strictObject({
      type: z.literal('vitalNeverAbove'),
      vital: VitalKeySchema,
      value: z.number(),
    }),
    z.strictObject({ type: z.literal('rulePassed'), id }),
    z.strictObject({ type: z.literal('ruleFailed'), id }),
    z.strictObject({ type: z.literal('all'), tests: z.array(RuleTestSchema).min(1) }),
    z.strictObject({ type: z.literal('any'), tests: z.array(RuleTestSchema).min(1) }),
    z.strictObject({ type: z.literal('not'), test: RuleTestSchema }),
  ]),
);

const textVariant = z.strictObject({ when: ConditionSchema.optional(), text: z.string() });

const processEffect = z.strictObject({
  target: effectTarget,
  perPoint: z.number(),
  above: z.number().min(0).max(100).optional(),
  exponent: z.number().positive().optional(),
  group: z.string().optional(),
});

export const CaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  version: z.number().int().positive(),
  title: text,
  summary: text,
  specialty: text,
  difficulty: z.enum(['foundation', 'core', 'advanced']),
  estMinutes: z.number().positive(),
  tags: z.array(z.string()).optional(),
  patient: z.strictObject({
    name: text,
    age: z.number().min(0).max(120),
    sex: z.enum(['male', 'female']),
    weightKg: z.number().min(1).max(300),
    occupation: z.string().optional(),
    persona: text,
  }),
  brief: z.array(text).min(1),
  openingLine: text,
  baseline: z.strictObject({
    hr: z.number().min(20).max(250),
    sbp: z.number().min(40).max(260),
    dbp: z.number().min(20).max(160),
    rr: z.number().min(2).max(70),
    temp: z.number().min(25).max(45),
    glucose: z.number().min(0.5).max(60),
    paco2: z.number().min(2).max(15).optional(),
    shunt: z.number().min(0).max(0.6).optional(),
    vq: z.number().min(0).optional(),
    svo2: z.number().min(0.2).max(0.9).optional(),
    hrJitter: z.number().min(0).optional(),
    sbpJitter: z.number().min(0).optional(),
    ...sourced,
  }),
  labs: z.record(z.string(), z.number()),
  processes: z
    .array(
      z.strictObject({
        id,
        type: id,
        label: text,
        initial: z.number().min(0).max(100),
        initialJitter: z.number().min(0).optional(),
        ratePerMin: z.number(),
        rateJitterPct: z.number().min(0).max(100).optional(),
        decayTauMin: z.number().positive().optional(),
        recoveryPerMin: z.number().min(0).optional(),
        sensitivityJitterPct: z.number().min(0).max(100).optional(),
        arrestAt: z.number().min(0).max(100).optional(),
        arrestRhythm: RhythmSchema.optional(),
        effects: z.array(processEffect),
        ...sourced,
      }),
    )
    .min(1),
  bands: z.strictObject({ process: id, cutoffs: z.array(z.number()) }),
  dialogue: z.array(
    z.strictObject({
      id,
      category: z.enum(TALK_CATEGORIES),
      q: text,
      a: z.array(z.string()).min(1),
      keywords: z.array(z.string()).optional(),
    }),
  ),
  exam: z.array(
    z.strictObject({
      id,
      label: text,
      kind: z.enum(['abcde', 'region']),
      region: z.string().optional(),
      findings: z.array(textVariant).min(1),
    }),
  ),
  investigations: z.array(
    z.strictObject({ id, orderNote: z.string().optional(), results: z.array(textVariant).min(1) }),
  ),
  patientLines: z.array(z.strictObject({ id, when: ConditionSchema, text })),
  rhythmRules: z
    .array(
      z.strictObject({
        id,
        from: z.array(RhythmSchema).optional(),
        to: RhythmSchema,
        when: ConditionSchema,
        probPerMin: z.number().min(0).optional(),
        ...sourced,
      }),
    )
    .optional(),
  outcomes: z.strictObject({
    stabilised: z.strictObject({
      when: ConditionSchema,
      forSec: z.number().min(0),
      text,
    }),
  }),
  diagnosis: z.strictObject({
    correct: z.array(id).min(1),
    options: z.array(z.strictObject({ id, label: text })).min(2),
  }),
  scoring: z.array(
    z.strictObject({
      id,
      label: text,
      weight: z.number().min(0),
      kind: z.enum(['credit', 'penalty']),
      critical: z.boolean().optional(),
      test: RuleTestSchema,
    }),
  ),
  teaching: z.array(z.strictObject({ id, text, showIf: RuleTestSchema.optional() })),
  references: z.array(z.strictObject({ id, label: text, url: z.url().optional() })),
}) satisfies z.ZodType<CaseDef>;

const transient = z.strictObject({
  tauMin: z.number().positive(),
  amplitude: z.number(),
  effects: z.array(z.strictObject({ target: effectTarget, value: z.number() })),
  ectopy: z.boolean().optional(),
});

export const FormularySchema = z.strictObject({
  version: z.number().int(),
  drugs: z.array(
    z.strictObject({
      id,
      name: text,
      aliases: z.array(z.string()).optional(),
      drugClass: text,
      unit: text,
      halfLifeMin: z.number().positive(),
      feedback: z.string().optional(),
      ...sourced,
      routes: z
        .array(
          z.strictObject({
            route: RouteSchema,
            label: text,
            standardDose: z.number().positive(),
            minDose: z.number().positive().optional(),
            maxDose: z.number().positive().optional(),
            bioavailability: z.number().min(0).max(1),
            absorptionHalfLifeMin: z.number().min(0),
            ...sourced,
          }),
        )
        .min(1),
      effects: z.array(
        z.strictObject({
          target: drugTarget,
          emax: z.number(),
          ec50: z.number().positive(),
          ...sourced,
        }),
      ),
      adverse: z
        .array(
          z.strictObject({
            id,
            routes: z.array(RouteSchema).optional(),
            whenNotArrest: z.boolean().optional(),
            repeatWithinSec: z.number().positive().optional(),
            doseAbove: z.number().positive().optional(),
            level: z.enum(['warn', 'danger']),
            message: text,
            say: z.string().optional(),
            transient: transient.optional(),
            harm: z.boolean().optional(),
            ...sourced,
          }),
        )
        .optional(),
    }),
  ),
  fluids: z.array(
    z.strictObject({
      id,
      name: text,
      standardVolumeMl: z.number().positive(),
      maxRateMlPerMin: z.number().positive(),
      redistributionTauMin: z.number().positive(),
      effects: z.array(
        z.strictObject({
          target: effectTarget,
          perLitre: z.number(),
          maxLitres: z.number().positive().optional(),
        }),
      ),
      ...sourced,
    }),
  ),
}) satisfies z.ZodType<Formulary>;

export const DeviceTableSchema = z.strictObject({
  version: z.number().int(),
  devices: z.array(
    z.strictObject({
      id,
      label: text,
      sub: z.string().optional(),
      category: z.enum(['oxygen', 'position', 'airway', 'monitoring']),
      short: z.string().optional(),
      fio2: z.number().min(0.21).max(1).optional(),
      effects: z.array(z.strictObject({ target: effectTarget, value: z.number() })).optional(),
      onText: text,
      offText: text,
      ...sourced,
    }),
  ),
  procedures: z.array(
    z.strictObject({
      id,
      label: text,
      sub: z.string().optional(),
      grants: z.enum(['iv', 'io']).optional(),
      doneText: text,
      alreadyText: z.string().optional(),
      ...sourced,
    }),
  ),
}) satisfies z.ZodType<DeviceTable>;

export const InvestigationTableSchema = z.strictObject({
  version: z.number().int(),
  investigations: z.array(
    z.strictObject({
      id,
      label: text,
      sub: z.string().optional(),
      category: z.enum(['bedside', 'lab', 'imaging']),
      turnaroundMin: z.number().min(0),
      ...sourced,
    }),
  ),
}) satisfies z.ZodType<InvestigationTable>;
