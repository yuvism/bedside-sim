/**
 * The engine's working model: the loaded case, its serialisable state, lookup
 * tables, and the derived outputs (vitals, labs, signs) for the current tick.
 * Shared by engine.ts (time) and actions.ts (interventions).
 */
import type { ProcessDef } from './caseTypes.ts';
import { evalCondition, type ConditionContext } from './conditions.ts';
import { AIR_FIO2, physiology } from './coupling.ts';
import { drugEffects, type EffectTotals } from './pharmacology.ts';
import { accumulateEffects } from './processes.ts';
import { arrestMonitorRate, isPerfusing } from './rhythms.ts';
import type { Rng } from './rng.ts';
import type {
  CaseDef,
  DeviceDef,
  DrugDef,
  EngineLibrary,
  EngineState,
  FluidDef,
  InvestigationDef,
  ProcedureDef,
  Route,
  SimEvent,
  SimEventType,
  Signs,
  Vitals,
} from './types.ts';

/** Ectopy shows while an ectopy-causing transient is above this amplitude. */
export const ECTOPY_MIN = 0.25;

export interface Defs {
  drugs: Map<string, DrugDef>;
  fluids: Map<string, FluidDef>;
  devices: Map<string, DeviceDef>;
  procedures: Map<string, ProcedureDef>;
  investigations: Map<string, InvestigationDef>;
  processes: Map<string, ProcessDef>;
}

export interface Computed {
  vitals: Vitals;
  labs: Record<string, number>;
  signs: Signs;
  /** Physiological heart rate before any rhythm override. */
  hrPre: number;
}

export interface Model {
  c: CaseDef;
  s: EngineState;
  rng: Rng;
  defs: Defs;
  out: Computed;
}

const byId = <T extends { id: string }>(xs: readonly T[]) => new Map(xs.map((x) => [x.id, x]));

export function buildDefs(lib: EngineLibrary, c: CaseDef): Defs {
  return {
    drugs: byId(lib.formulary.drugs),
    fluids: byId(lib.formulary.fluids),
    devices: byId(lib.devices.devices),
    procedures: byId(lib.devices.procedures),
    investigations: byId(lib.investigations.investigations),
    processes: byId(c.processes),
  };
}

export interface CollectedEffects {
  totals: EffectTotals;
  deltas: Record<string, number>;
  fio2: number;
}

const addTo = (out: Record<string, number>, k: string, v: number) => {
  out[k] = (out[k] ?? 0) + v;
};

/** Sum every source of effect into one table of offsets. */
export function collectEffects(m: Model): CollectedEffects {
  const { s, defs } = m;
  const totals = drugEffects(defs.drugs, s.drugs, m.c.patient.weightKg);
  const deltas: Record<string, number> = {};
  for (const ps of s.processes) {
    const def = defs.processes.get(ps.id);
    if (def) accumulateEffects(def, ps, totals.block, deltas);
  }
  for (const [k, v] of Object.entries(totals.add)) {
    if (!k.startsWith('process:')) addTo(deltas, k, v);
  }
  for (const f of s.fluids) {
    const def = defs.fluids.get(f.fluidId);
    if (!def) continue;
    for (const e of def.effects) {
      const litres = Math.min(f.circulatingMl / 1000, e.maxLitres ?? Infinity);
      addTo(deltas, e.target, e.perLitre * litres);
    }
  }
  let fio2 = AIR_FIO2;
  for (const id of s.devices) {
    const def = defs.devices.get(id);
    if (!def) continue;
    if (def.fio2 !== undefined) fio2 = Math.max(fio2, def.fio2);
    for (const e of def.effects ?? []) addTo(deltas, e.target, e.value);
  }
  for (const tr of s.transients) {
    for (const e of tr.effects) addTo(deltas, e.target, e.value * tr.amplitude);
  }
  return { totals, deltas, fio2 };
}

export function compute(m: Model, eff: CollectedEffects = collectEffects(m)): Computed {
  const { s, c } = m;
  const p = physiology({
    baseline: c.baseline,
    base: s.baseline,
    labs: c.labs,
    d: eff.deltas,
    fio2: eff.fio2,
    noise: s.noise,
    weightKg: c.patient.weightKg,
  });
  const ectopy = s.transients.some((tr) => tr.ectopy && tr.amplitude > ECTOPY_MIN);
  if (s.arrest || !isPerfusing(s.rhythm)) {
    const vitals: Vitals = {
      hr: arrestMonitorRate(s.rhythm),
      sbp: null,
      dbp: null,
      map: null,
      spo2: null,
      rr: 0,
      etco2: 0,
      temp: p.temp,
      gcs: 3,
      glucose: p.glucose,
      rhythm: s.rhythm,
      ectopy: false,
    };
    const signs = { ...p.signs, cyanosis: 1, eyesClosed: 1, effort: 0, sweating: 0 };
    return { vitals, labs: p.labs, signs, hrPre: p.hr };
  }
  const vitals: Vitals = {
    hr: p.hr,
    sbp: p.sbp,
    dbp: p.dbp,
    map: p.map,
    spo2: p.spo2,
    rr: p.rr,
    etco2: p.etco2,
    temp: p.temp,
    gcs: p.gcs,
    glucose: p.glucose,
    rhythm: s.rhythm,
    ectopy,
  };
  return { vitals, labs: p.labs, signs: p.signs, hrPre: p.hr };
}

export function severityOf(m: Model, processId: string): number {
  return m.s.processes.find((p) => p.id === processId)?.severity ?? 0;
}

export function drugGiven(m: Model, drugId: string, route?: Route): boolean {
  const d = m.s.drugs.find((x) => x.drugId === drugId);
  return !!d && d.doses.some((x) => !route || x.route === route);
}

export function context(m: Model): ConditionContext {
  return {
    t: m.s.t,
    severity: (id) => severityOf(m, id),
    vitals: m.out.vitals,
    labs: m.out.labs,
    drugGiven: (id, route) => drugGiven(m, id, route),
    deviceOn: (id) => m.s.devices.includes(id),
    access: m.s.access,
    arrest: m.s.arrest,
  };
}

export function check(m: Model, cond: Parameters<typeof evalCondition>[0]): boolean {
  return evalCondition(cond, context(m));
}

/** "15 L O₂" or "air", for text templates. */
export function o2Label(m: Model): string {
  for (const id of m.s.devices) {
    const def = m.defs.devices.get(id);
    if (def?.category === 'oxygen') return def.short ?? def.label;
  }
  return 'air';
}

export function event(
  m: Model,
  type: SimEventType,
  code: string,
  text: string,
  data?: SimEvent['data'],
): SimEvent {
  return data ? { t: m.s.t, type, code, text, data } : { t: m.s.t, type, code, text };
}
