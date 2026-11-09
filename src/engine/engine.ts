/**
 * PhysiologyEngine — the portable interface (mirrored in unity/) — and
 * SimpleEngine, the deterministic teaching model behind it.
 *
 * Time advances in fixed 1 s ticks. Within a tick: drugs absorb and clear,
 * fluids run in, transients decay, processes progress, noise wanders, then
 * vitals are recomputed and rhythm, patient lines, results and outcomes are
 * checked. Same seed + same actions at the same ticks = identical run.
 */
import { applyAction } from './actions.ts';
import { arrestTick, enterArrest } from './als.ts';
import { evalCondition } from './conditions.ts';
import { buildDefs, collectEffects, compute, context, event, type Model } from './model.ts';
import { stepDrug } from './pharmacology.ts';
import { initProcess, stepProcess } from './processes.ts';
import { isPerfusing, nextRhythm, RHYTHM_LABELS, sinusFor } from './rhythms.ts';
import { ouStep, Rng, seedToState } from './rng.ts';
import type {
  Access,
  Action,
  CaseDef,
  EngineLibrary,
  EngineState,
  SimEvent,
  Signs,
  Vitals,
} from './types.ts';

export interface PhysiologyEngine {
  load(caseDef: CaseDef, seed: number): void;
  /** Fixed 1 s internal timestep. */
  step(dtSec: number): SimEvent[];
  /** Order, drug, procedure, device. */
  apply(action: Action): SimEvent[];
  /** hr, sbp, dbp, map, spo2, rr, etco2, temp, gcs, glucose, rhythm */
  vitals(): Vitals;
  /** Current lab truth (for result generation). */
  labs(): Record<string, number>;
  /** Serialisable, for save/replay. */
  snapshot(): EngineState;
  restore(s: EngineState): void;
}

export interface EngineStatus {
  t: number;
  arrest: boolean;
  outcome: EngineState['outcome'];
  devices: string[];
  access: Access;
  fluidsRunning: { fluidId: string; pendingMl: number }[];
  infusions: { drugId: string; rate: number }[];
  cpr: boolean;
  /** Present while in cardiac arrest. */
  als: { t0: number; cprSec: number; shocks: number; cprSinceCheck: number } | null;
  procedures: Record<string, number>;
  doses: { drugId: string; count: number; lastT: number }[];
  pendingOrders: { investigationId: string; dueT: number }[];
  helpCalled: boolean;
  diagnosis: string | null;
}

/** Extra read-outs the bedside UI needs; not part of the portable contract. */
export interface BedsideEngine extends PhysiologyEngine {
  readonly time: number;
  signs(): Signs;
  severities(): Record<string, number>;
  status(): EngineStatus;
}

/** Smooth monitor noise: correlation time (s) and SD per vital. */
const NOISE: Record<string, { tau: number; sigma: number }> = {
  hr: { tau: 20, sigma: 1.2 },
  sbp: { tau: 25, sigma: 1.5 },
  rr: { tau: 30, sigma: 0.5 },
  spo2: { tau: 15, sigma: 0.3 },
  etco2: { tau: 20, sigma: 0.6 },
};

const TICK = 1;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export class SimpleEngine implements BedsideEngine {
  private m: Model | null = null;
  private readonly lib: EngineLibrary;

  constructor(lib: EngineLibrary) {
    this.lib = lib;
  }

  load(caseDef: CaseDef, seed: number): void {
    const rng = new Rng(seedToState(seed));
    const b = caseDef.baseline;
    const sbp = rng.jitter(b.sbp, b.sbpJitter ?? 0);
    const s: EngineState = {
      caseId: caseDef.id,
      seed,
      t: 0,
      acc: 0,
      rng: 0,
      baseline: {
        hr: rng.jitter(b.hr, b.hrJitter ?? 0),
        sbp,
        dbp: (b.dbp * sbp) / b.sbp,
        rr: b.rr,
      },
      processes: caseDef.processes.map((p) => initProcess(p, rng)),
      drugs: [],
      fluids: [],
      transients: [],
      devices: [],
      access: { iv: false, io: false, art: false },
      noise: Object.fromEntries(Object.keys(NOISE).map((k) => [k, 0])),
      rhythm: 'sinus',
      arrest: false,
      arrestT: null,
      als: null,
      cpr: false,
      arrests: 0,
      procedures: {},
      linesFired: [],
      stableForSec: 0,
      outcome: null,
      orders: [],
      helpCalled: false,
      diagnosis: null,
    };
    const placeholder = { vitals: {} as Vitals, labs: {}, signs: {}, hrPre: b.hr, fx: {} };
    const m: Model = { c: caseDef, s, rng, defs: buildDefs(this.lib, caseDef), out: placeholder };
    m.out = compute(m);
    s.rhythm = sinusFor(m.out.hrPre);
    m.out = compute(m);
    s.rng = rng.state;
    this.m = m;
  }

  private get model(): Model {
    if (!this.m) throw new Error('No case loaded. Call load() first.');
    return this.m;
  }

  get time(): number {
    return this.m?.s.t ?? 0;
  }

  step(dtSec: number): SimEvent[] {
    const m = this.model;
    const out: SimEvent[] = [];
    m.s.acc += Math.max(0, dtSec);
    while (m.s.acc >= TICK - 1e-9) {
      m.s.acc -= TICK;
      out.push(...this.tick(m));
    }
    if (m.s.acc < 1e-9) m.s.acc = 0;
    m.s.rng = m.rng.state;
    return out;
  }

  apply(action: Action): SimEvent[] {
    const m = this.model;
    const events = applyAction(m, action);
    m.out = compute(m);
    m.s.rng = m.rng.state;
    return events;
  }

  vitals(): Vitals {
    return { ...this.model.out.vitals };
  }

  labs(): Record<string, number> {
    return { ...this.model.out.labs };
  }

  signs(): Signs {
    return { ...this.model.out.signs };
  }

  severities(): Record<string, number> {
    return Object.fromEntries(this.model.s.processes.map((p) => [p.id, p.severity]));
  }

  status(): EngineStatus {
    const s = this.model.s;
    return {
      t: s.t,
      arrest: s.arrest,
      outcome: s.outcome,
      devices: [...s.devices],
      access: { ...s.access },
      fluidsRunning: s.fluids
        .filter((f) => f.pendingMl > 0)
        .map((f) => ({ fluidId: f.fluidId, pendingMl: f.pendingMl })),
      infusions: s.drugs
        .filter((d) => d.infusionRate > 0)
        .map((d) => ({ drugId: d.drugId, rate: d.infusionRate })),
      cpr: s.cpr,
      als: s.als ? { ...s.als } : null,
      procedures: { ...s.procedures },
      doses: s.drugs.map((d) => ({
        drugId: d.drugId,
        count: d.doses.length,
        lastT: d.doses[d.doses.length - 1]?.t ?? 0,
      })),
      pendingOrders: s.orders
        .filter((o) => !o.reported)
        .map((o) => ({ investigationId: o.investigationId, dueT: o.dueT })),
      helpCalled: s.helpCalled,
      diagnosis: s.diagnosis,
    };
  }

  snapshot(): EngineState {
    const m = this.model;
    m.s.rng = m.rng.state;
    return clone(m.s);
  }

  restore(state: EngineState): void {
    const m = this.model;
    if (state.caseId !== m.c.id) {
      throw new Error(`Snapshot is for case ${state.caseId}, but ${m.c.id} is loaded.`);
    }
    m.s = clone(state);
    m.rng = new Rng(state.rng);
    m.out = compute(m);
  }

  // -------------------------------------------------------------------------

  private tick(m: Model): SimEvent[] {
    const { s, c, defs } = m;
    const dtMin = TICK / 60;
    const tMin = s.t / 60;
    const ev: SimEvent[] = [];

    for (const d of s.drugs) {
      const def = defs.drugs.get(d.drugId);
      if (def) stepDrug(def, d, dtMin, c.patient.weightKg);
    }
    for (const f of s.fluids) {
      const def = defs.fluids.get(f.fluidId);
      if (!def) continue;
      if (f.pendingMl > 0) {
        const g = Math.min(def.maxRateMlPerMin * dtMin, f.pendingMl);
        f.pendingMl -= g;
        f.circulatingMl += g;
        f.totalMl += g;
        for (const e of def.effects) {
          if (!e.target.startsWith('process:')) continue;
          const type = e.target.slice('process:'.length);
          for (const ps of s.processes) {
            if (defs.processes.get(ps.id)?.type !== type) continue;
            ps.severity = Math.max(
              0,
              Math.min(100, ps.severity + (e.perLitre * g * ps.sensitivity) / 1000),
            );
          }
        }
        if (f.pendingMl <= 1e-6) {
          f.pendingMl = 0;
          ev.push(event(m, 'system', `done:fluid:${def.id}`, `${def.name} bolus finished.`));
        }
      }
      f.circulatingMl *= Math.exp(-dtMin / def.redistributionTauMin);
    }
    for (const tr of s.transients) tr.amplitude *= Math.exp(-dtMin / tr.tauMin);
    s.transients = s.transients.filter((tr) => tr.amplitude > 0.01);

    {
      // Processes keep going in arrest; drugs then only circulate with CPR.
      const { totals } = collectEffects(m);
      const circulation = s.arrest ? (s.cpr ? 0.5 : 0) : 1;
      const ctx = context(m);
      for (const ps of s.processes) {
        const def = defs.processes.get(ps.id);
        if (!def) continue;
        let rate = (totals.add[`process:${def.type}`] ?? 0) * circulation;
        for (const tr of def.treatments ?? [])
          if (evalCondition(tr.when, ctx)) rate += tr.ratePerMin;
        stepProcess(def, ps, tMin, dtMin, rate);
      }
    }
    for (const [k, spec] of Object.entries(NOISE)) {
      s.noise[k] = ouStep(s.noise[k] ?? 0, spec.tau, spec.sigma, TICK, m.rng.normal());
    }

    s.t += TICK;
    m.out = compute(m);
    // Event times are stamped after the clock moves, so they line up with the vitals.
    for (const e of ev) e.t = s.t;

    if (!s.arrest) {
      for (const ps of s.processes) {
        const def = defs.processes.get(ps.id);
        if (def?.arrestAt !== undefined && ps.severity >= def.arrestAt) {
          ev.push(...enterArrest(m, def.arrestRhythm ?? 'vf'));
          break;
        }
      }
    }
    if (!s.arrest) {
      const r = nextRhythm(s.rhythm, m.out.hrPre, c.rhythmRules ?? [], context(m), m.rng, dtMin);
      if (r.rhythm !== s.rhythm) {
        if (!isPerfusing(r.rhythm)) ev.push(...enterArrest(m, r.rhythm));
        else {
          const quiet = r.ruleId === null;
          s.rhythm = r.rhythm;
          m.out = compute(m);
          if (!quiet) {
            ev.push(event(m, 'warn', `rhythm:${r.rhythm}`, `${RHYTHM_LABELS[r.rhythm]}.`));
          }
        }
      }
    }

    if (s.arrest) ev.push(...arrestTick(m, TICK));

    if (!s.arrest) {
      const ctx = context(m);
      for (const line of c.patientLines) {
        if (s.linesFired.includes(line.id) || !evalCondition(line.when, ctx)) continue;
        s.linesFired.push(line.id);
        ev.push(event(m, 'patient', `line:${line.id}`, line.text));
      }
    }

    for (const o of s.orders) {
      if (o.reported || s.t < o.dueT) continue;
      o.reported = true;
      const label = defs.investigations.get(o.investigationId)?.label ?? o.investigationId;
      ev.push(event(m, 'result', `result:${o.investigationId}`, `${label}: ${o.text}`));
    }

    if (!s.outcome && !s.arrest) {
      const st = c.outcomes.stabilised;
      if (evalCondition(st.when, context(m))) {
        s.stableForSec += TICK;
        if (s.stableForSec >= st.forSec) {
          s.outcome = 'stabilised';
          ev.push(event(m, 'system', 'stable', st.text));
          ev.push(event(m, 'outcome', 'outcome:stabilised', 'Patient stabilised.'));
        }
      } else s.stableForSec = 0;
    }
    return ev;
  }
}
