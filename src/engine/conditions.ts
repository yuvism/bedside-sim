/** Evaluates the serialisable Condition language used in case files. */
import type { Access, Condition, Range, Rhythm, Route, Vitals } from './types.ts';

export interface ConditionContext {
  /** Sim time, seconds. */
  t: number;
  severity(processId: string): number;
  vitals: Vitals;
  labs: Readonly<Record<string, number>>;
  drugGiven(drugId: string, route?: Route): boolean;
  deviceOn(deviceId: string): boolean;
  access: Access;
  arrest: boolean;
}

export function inRange(v: number | null | undefined, r: Range): boolean {
  if (v === null || v === undefined || Number.isNaN(v)) return false;
  if (r.gte !== undefined && v < r.gte) return false;
  if (r.lt !== undefined && v >= r.lt) return false;
  return true;
}

export function evalCondition(c: Condition, ctx: ConditionContext): boolean {
  if ('all' in c) return c.all.every((x) => evalCondition(x, ctx));
  if ('any' in c) return c.any.some((x) => evalCondition(x, ctx));
  if ('not' in c) return !evalCondition(c.not, ctx);
  if ('severity' in c) return inRange(ctx.severity(c.severity), c);
  if ('vital' in c) return inRange(ctx.vitals[c.vital] as number | null, c);
  if ('lab' in c) return inRange(ctx.labs[c.lab], c);
  if ('time' in c) return inRange(ctx.t, c.time);
  if ('drugGiven' in c) return ctx.drugGiven(c.drugGiven, c.route);
  if ('device' in c) return ctx.deviceOn(c.device);
  if ('access' in c) {
    if (c.access === 'any') return ctx.access.iv || ctx.access.io;
    return ctx.access[c.access];
  }
  if ('arrest' in c) return ctx.arrest === c.arrest;
  if ('ectopy' in c) return ctx.vitals.ectopy === c.ectopy;
  if ('rhythm' in c) return (c.rhythm as readonly Rhythm[]).includes(ctx.vitals.rhythm);
  return false;
}
