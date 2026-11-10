/**
 * Reads a Zod 4 schema at runtime so the editor can draw a form for any part
 * of the case schema, and build sensible empty values for new items.
 * Pure (no React), so it is unit-tested directly.
 */
import type { z } from 'zod';

type Schema = z.core.$ZodType;
interface Def {
  type: string;
  [k: string]: unknown;
}

export const defOf = (s: Schema): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

/** Strips lazy wrappers (recursive condition and rule schemas). */
export function resolve(s: Schema): Schema {
  let cur = s;
  for (let i = 0; i < 10; i++) {
    const d = defOf(cur);
    if (d.type !== 'lazy') return cur;
    cur = (d['getter'] as () => Schema)();
  }
  return cur;
}

export interface Unwrapped {
  schema: Schema;
  optional: boolean;
}

/** Strips optional/nullable/default wrappers and lazies. */
export function unwrap(s: Schema): Unwrapped {
  let cur = resolve(s);
  let optional = false;
  for (let i = 0; i < 10; i++) {
    const d = defOf(cur);
    if (d.type === 'optional' || d.type === 'nullable' || d.type === 'default') {
      optional = optional || d.type !== 'default';
      cur = resolve(d['innerType'] as Schema);
    } else break;
  }
  return { schema: cur, optional };
}

export type Kind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'literal'
  | 'object'
  | 'array'
  | 'record'
  | 'tuple'
  | 'union'
  | 'unknown';

export function kindOf(s: Schema): Kind {
  const t = defOf(resolve(s)).type;
  switch (t) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'enum':
    case 'literal':
    case 'object':
    case 'array':
    case 'record':
    case 'tuple':
    case 'union':
      return t;
    default:
      return 'unknown';
  }
}

export const shapeOf = (s: Schema): Record<string, Schema> =>
  defOf(resolve(s))['shape'] as Record<string, Schema>;

export const elementOf = (s: Schema): Schema => defOf(resolve(s))['element'] as Schema;

export const itemsOf = (s: Schema): Schema[] => defOf(resolve(s))['items'] as Schema[];

export const recordValueOf = (s: Schema): Schema => defOf(resolve(s))['valueType'] as Schema;

export const optionsOf = (s: Schema): Schema[] => defOf(resolve(s))['options'] as Schema[];

export const enumValues = (s: Schema): string[] =>
  Object.values(defOf(resolve(s))['entries'] as Record<string, string>);

export const literalValue = (s: Schema): unknown => (defOf(resolve(s))['values'] as unknown[])[0];

/** The discriminator key of a discriminated union, if it is one. */
export const discriminatorOf = (s: Schema): string | null =>
  (defOf(resolve(s))['discriminator'] as string | undefined) ?? null;

interface CheckDef {
  check: string;
  minimum?: number;
  value?: number;
  inclusive?: boolean;
}

function checks(s: Schema): CheckDef[] {
  const list = (defOf(resolve(s))['checks'] as { _zod: { def: CheckDef } }[] | undefined) ?? [];
  return list.map((c) => c._zod.def);
}

/** Minimum array length (0 when unconstrained). */
export function minItems(s: Schema): number {
  const c = checks(s).find((x) => x.check === 'min_length');
  return c?.minimum ?? 0;
}

/** Numeric bounds for an <input type=number>. */
export function numberBounds(s: Schema): { min?: number; max?: number; int: boolean } {
  const out: { min?: number; max?: number; int: boolean } = { int: false };
  for (const c of checks(s)) {
    if (c.check === 'greater_than' && c.value !== undefined) out.min = c.value;
    if (c.check === 'less_than' && c.value !== undefined) out.max = c.value;
    if (c.check === 'number_format') out.int = true;
  }
  return out;
}

/** For a plain union of objects: the key that names each option (its first key). */
export function variantKey(option: Schema): string {
  return Object.keys(shapeOf(option))[0] ?? '';
}

/** Index of the union option that a value belongs to, or -1. */
export function variantIndex(union: Schema, value: unknown): number {
  if (typeof value !== 'object' || value === null) return -1;
  const opts = optionsOf(union);
  const disc = discriminatorOf(union);
  if (disc) {
    const v = (value as Record<string, unknown>)[disc];
    return opts.findIndex((o) => literalValue(shapeOf(o)[disc] as Schema) === v);
  }
  return opts.findIndex((o) => variantKey(o) in value);
}

/** A starting value that has every required field, for a new item. */
export function defaultFor(s: Schema, depth = 0): unknown {
  const { schema, optional } = unwrap(s);
  if (optional && depth > 0) return undefined;
  switch (kindOf(schema)) {
    case 'string':
      return '';
    case 'number':
      return numberBounds(schema).min ?? 0;
    case 'boolean':
      return false;
    case 'enum':
      return enumValues(schema)[0];
    case 'literal':
      return literalValue(schema);
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(shapeOf(schema))) {
        const val = defaultFor(v, depth + 1);
        if (val !== undefined) out[k] = val;
      }
      return out;
    }
    case 'array': {
      const n = minItems(schema);
      return Array.from({ length: n }, () => defaultFor(elementOf(schema), depth + 1));
    }
    case 'record':
      return {};
    case 'tuple':
      return itemsOf(schema).map((x) => defaultFor(x, depth + 1));
    case 'union': {
      const first = optionsOf(schema)[0];
      return first ? defaultFor(first, depth + 1) : undefined;
    }
    default:
      return undefined;
  }
}
