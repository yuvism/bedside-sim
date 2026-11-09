/** Zod schemas for the shared library files: formulary, devices, investigations, team. */
import { z } from 'zod';
import type { TeamConfig } from '../engine/team.ts';
import type { DeviceTable, Formulary, InvestigationTable } from '../engine/types.ts';
import {
  ConditionSchema,
  drugTarget,
  effectTarget,
  fluidTarget,
  id,
  RouteSchema,
  sourced,
  text,
} from './schema.ts';

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
      infusion: z
        .strictObject({
          unit: text,
          standardRate: z.number().positive(),
          minRate: z.number().min(0),
          maxRate: z.number().positive(),
          perKg: z.boolean(),
          amountPerMinPerRate: z.number().positive(),
          ...sourced,
        })
        .optional(),
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
      allergyClasses: z.array(z.string().min(1)).optional(),
      contraindications: z
        .array(
          z.strictObject({
            id,
            when: ConditionSchema,
            message: text,
            harm: z.boolean().optional(),
            ...sourced,
          }),
        )
        .optional(),
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
          target: fluidTarget,
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
      ventilation: z
        .strictObject({ support: z.number().min(0).max(1), minRr: z.number().min(0) })
        .optional(),
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
      category: z.enum(['access', 'airway', 'breathing', 'circulation', 'team']),
      grants: z.enum(['iv', 'io', 'art']).optional(),
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

const delay = z.strictObject({
  minSec: z.number().min(0),
  maxSec: z.number().min(0),
  ...sourced,
});

export const TeamSchema = z.strictObject({
  version: z.number().int(),
  delays: z.record(z.string(), delay),
  doseQueryFactor: z.number().min(1),
}) satisfies z.ZodType<TeamConfig>;
