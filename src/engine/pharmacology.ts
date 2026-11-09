/**
 * One-compartment pharmacokinetics with first-order absorption, and an Emax
 * effect model per target.
 *
 *   depot --ka--> central --ke--> eliminated
 *   effect = Emax × C / (EC50 + C), C normalised to a 70 kg adult
 */
import type { DrugDef, DrugRoute, DrugState, Route } from './types.ts';

const REF_WEIGHT_KG = 70;
const NEGLIGIBLE = 1e-6;
const MAX_BLOCK = 0.95;

export function newDrugState(drugId: string): DrugState {
  return { drugId, depots: [], central: 0, doses: [] };
}

export function findRoute(def: DrugDef, route: Route): DrugRoute | undefined {
  return def.routes.find((r) => r.route === route);
}

/** Put a dose into the body at time t (seconds). */
export function addDose(s: DrugState, route: DrugRoute, dose: number, t: number): void {
  const amount = dose * route.bioavailability;
  if (route.absorptionHalfLifeMin > 0) {
    const depot = s.depots.find((d) => d.route === route.route);
    if (depot) depot.amount += amount;
    else s.depots.push({ route: route.route, amount });
  } else {
    s.central += amount;
  }
  s.doses.push({ t, route: route.route, dose });
}

/** Advance absorption and elimination by dtMin minutes (exact exponentials). */
export function stepDrug(def: DrugDef, s: DrugState, dtMin: number): void {
  for (const depot of s.depots) {
    const r = findRoute(def, depot.route);
    const half = r && r.absorptionHalfLifeMin > 0 ? r.absorptionHalfLifeMin : 1e-3;
    const moved = depot.amount * (1 - Math.exp((-Math.LN2 / half) * dtMin));
    depot.amount -= moved;
    s.central += moved;
    if (depot.amount < NEGLIGIBLE) depot.amount = 0;
  }
  s.central *= Math.exp((-Math.LN2 / def.halfLifeMin) * dtMin);
  if (s.central < NEGLIGIBLE) s.central = 0;
}

export function emaxEffect(c: number, emax: number, ec50: number): number {
  return c > 0 ? (emax * c) / (ec50 + c) : 0;
}

export interface EffectTotals {
  /** Summed additive effects by target (including process:<type>). */
  add: Record<string, number>;
  /** Combined block fraction by group: 1 − Π(1 − bᵢ). */
  block: Record<string, number>;
}

export function drugEffects(
  defs: ReadonlyMap<string, DrugDef>,
  states: readonly DrugState[],
  weightKg: number,
): EffectTotals {
  const add: Record<string, number> = {};
  const unblocked: Record<string, number> = {};
  const scale = REF_WEIGHT_KG / weightKg;
  for (const s of states) {
    const def = defs.get(s.drugId);
    if (!def || s.central <= 0) continue;
    const c = s.central * scale;
    for (const e of def.effects) {
      const v = emaxEffect(c, e.emax, e.ec50);
      if (e.target.startsWith('block:')) {
        const g = e.target.slice(6);
        const b = Math.min(MAX_BLOCK, Math.max(0, v));
        unblocked[g] = (unblocked[g] ?? 1) * (1 - b);
      } else {
        add[e.target] = (add[e.target] ?? 0) + v;
      }
    }
  }
  const block: Record<string, number> = {};
  for (const [g, u] of Object.entries(unblocked)) block[g] = 1 - u;
  return { add, block };
}

/** Seconds since the last dose of this drug by this route, or Infinity. */
export function sinceLastDose(s: DrugState | undefined, route: Route, t: number): number {
  if (!s) return Infinity;
  for (let i = s.doses.length - 1; i >= 0; i--) {
    const d = s.doses[i];
    if (d && d.route === route) return t - d.t;
  }
  return Infinity;
}
