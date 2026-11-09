/** Evaluates the serialisable Condition language used in case files. */
import type { Access, Condition, Range, Rhythm, Route, Vitals } from './types.ts';

export interface ConditionContext {
  /** Sim time, seconds. */
  t: number;
  severity(processId: string): number;
  vitals: Vitals;
  labs: Readonly<Record<string, number>>;
  /** Time of the first dose of this drug (by route if given), or null. */
  firstDoseT(drugId: string, route?: Route): number | null;
  infusing(drugId: string): boolean;
  /** Time a procedure was done, or null. */
  procedureT(procedureId: string): number | null;
  /** Current summed drug effect on a target (0 when none). */
  effect(target: string): number;
  deviceOn(deviceId: string): boolean;
  access: Access;
  arrest: boolean;
  cpr: boolean;
}

export function inRange(v: number | null | undefined, r: Range): boolean {
  if (v === null || v === undefined || Number.isNaN(v)) return false;
  if (r.gte !== undefined && v < r.gte) return false;
  if (r.lt !== undefined && v >= r.lt) return false;
  return true;
}

function sinceOk(at: number | null, now: number, forSec?: number, withinSec?: number): boolean {
  if (at === null) return false;
  if (forSec !== undefined && now - at < forSec) return false;
  if (withinSec !== undefined && now - at >= withinSec) return false;
  return true;
}

export function evalCondition(c: Condition, ctx: ConditionContext): boolean {
  if ('all' in c) return c.all.every((x) => evalCondition(x, ctx));
  if ('any' in c) return c.any.some((x) => evalCondition(x, ctx));
  if ('not' in c) return !evalCondition(c.not, ctx);
  if ('severity' in c) return inRange(ctx.severity(c.severity), c);
  if ('vital' in c) return inRange(ctx.vitals[c.vital] as number | null, c);
  if ('lab' in c) return inRange(ctx.labs[c.lab], c);
  if ('effect' in c) return inRange(ctx.effect(c.effect), c);
  if ('time' in c) return inRange(ctx.t, c.time);
  if ('drugGiven' in c) return sinceOk(ctx.firstDoseT(c.drugGiven, c.route), ctx.t, c.forSec);
  if ('infusing' in c) return ctx.infusing(c.infusing);
  if ('procedure' in c) {
    return sinceOk(ctx.procedureT(c.procedure), ctx.t, c.forSec, c.withinSec);
  }
  if ('device' in c) return ctx.deviceOn(c.device);
  if ('access' in c) {
    if (c.access === 'any') return ctx.access.iv || ctx.access.io;
    return ctx.access[c.access];
  }
  if ('arrest' in c) return ctx.arrest === c.arrest;
  if ('cpr' in c) return ctx.cpr === c.cpr;
  if ('ectopy' in c) return ctx.vitals.ectopy === c.ectopy;
  if ('rhythm' in c) return (c.rhythm as readonly Rhythm[]).includes(ctx.vitals.rhythm);
  return false;
}
