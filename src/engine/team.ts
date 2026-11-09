/**
 * The nurse: takes the clinician's orders, reads them back (closed-loop
 * communication), carries them out after a realistic seeded delay, and
 * queries unsafe orders (allergy, contraindication, overdose, no access)
 * until the clinician confirms or cancels.
 *
 * Talking, examining, diagnosing, calling for help and the ALS actions
 * (CPR, shocks, pulse checks) are done by the clinician and happen at once.
 */
import type { BedsideEngine } from './engine.ts';
import { Rng, seedToState } from './rng.ts';
import type { Action, EngineLibrary, SimEvent, Sourced } from './types.ts';

export interface DelaySpec extends Sourced {
  minSec: number;
  maxSec: number;
}

export interface TeamConfig {
  version: number;
  /** Keys: drug, drugArrest, infusion, fluid, device, order, procedure, procedure:<id>, team. */
  delays: Record<string, DelaySpec>;
  /** Doses or rates above this multiple of the usual maximum are queried. */
  doseQueryFactor: number;
}

export interface PendingTask {
  id: number;
  action: Action;
  label: string;
  orderedT: number;
  dueT: number;
}

export interface NurseQuery {
  id: number;
  action: Action;
  kind: 'allergy' | 'contraindication' | 'dose' | 'access';
  question: string;
}

export interface NurseState {
  nextId: number;
  rng: number;
  pending: PendingTask[];
  queries: NurseQuery[];
}

const IMMEDIATE: ReadonlySet<Action['kind']> = new Set([
  'talk',
  'exam',
  'diagnosis',
  'call_help',
  'cpr',
  'shock',
  'pulse_check',
]);

export class Nurse {
  private readonly engine: BedsideEngine;
  private readonly lib: EngineLibrary;
  private readonly cfg: TeamConfig;
  private st: NurseState;
  private rng: Rng;

  constructor(engine: BedsideEngine, lib: EngineLibrary, cfg: TeamConfig, seed: number) {
    this.engine = engine;
    this.lib = lib;
    this.cfg = cfg;
    this.st = { nextId: 1, rng: seedToState(seed ^ 0x6e757273), pending: [], queries: [] };
    this.rng = new Rng(this.st.rng);
  }

  get pending(): readonly PendingTask[] {
    return this.st.pending;
  }

  get queries(): readonly NurseQuery[] {
    return this.st.queries;
  }

  snapshot(): NurseState {
    this.st.rng = this.rng.state;
    return JSON.parse(JSON.stringify(this.st)) as NurseState;
  }

  restore(s: NurseState): void {
    this.st = JSON.parse(JSON.stringify(s)) as NurseState;
    this.rng = new Rng(this.st.rng);
  }

  /** The clinician asks for something. */
  request(action: Action): SimEvent[] {
    if (IMMEDIATE.has(action.kind) || this.isStop(action)) return this.engine.apply(action);
    const dup = this.st.pending.find((p) => sameTask(p.action, action));
    if (dup) return [this.say('busy', `I'm already doing that: ${dup.label}.`)];
    const query = this.safetyCheck(action);
    if (query) {
      const q: NurseQuery = { ...query, id: this.st.nextId++, action };
      this.st.queries.push(q);
      return [this.say(`query:${q.kind}`, q.question, { queryId: q.id })];
    }
    return this.queue(action, this.lineReadyAt(action));
  }

  /** The clinician confirms a queried order. */
  confirm(queryId: number): SimEvent[] {
    const q = this.take(queryId);
    if (!q) return [];
    if (q.kind === 'access') {
      const cannula = this.queue({ kind: 'procedure', procedureId: 'iv_access' });
      const after = this.st.pending.at(-1)?.dueT ?? this.engine.time;
      return [...cannula, ...this.queue(q.action, after)];
    }
    return [
      this.say(`override:${q.kind}`, 'Understood. Doing it as you asked.'),
      ...this.queue(q.action, this.lineReadyAt(q.action)),
    ];
  }

  cancel(queryId: number): SimEvent[] {
    const q = this.take(queryId);
    return q ? [this.say(`cancelled:${q.kind}`, "OK, I won't do that.")] : [];
  }

  /** Carry out any tasks that are due. Call after each engine step. */
  tick(): SimEvent[] {
    const now = this.engine.time;
    const due = this.st.pending.filter((p) => p.dueT <= now).sort((a, b) => a.dueT - b.dueT);
    if (!due.length) return [];
    this.st.pending = this.st.pending.filter((p) => p.dueT > now);
    return due.flatMap((p) => this.engine.apply(p.action));
  }

  // ---------------------------------------------------------------------------

  private take(id: number): NurseQuery | undefined {
    const q = this.st.queries.find((x) => x.id === id);
    this.st.queries = this.st.queries.filter((x) => x.id !== id);
    return q;
  }

  /** If a cannula is still going in and this order needs it, when it will be ready. */
  private lineReadyAt(a: Action): number | undefined {
    const needsLine =
      a.kind === 'fluid' ||
      a.kind === 'infusion' ||
      (a.kind === 'drug' && (a.route === 'IV' || a.route === 'IO'));
    if (!needsLine) return undefined;
    const line = this.st.pending.find(
      (p) =>
        p.action.kind === 'procedure' && ['iv_access', 'io_access'].includes(p.action.procedureId),
    );
    return line?.dueT;
  }

  private isStop(a: Action): boolean {
    return (a.kind === 'device' && !a.on) || (a.kind === 'infusion' && a.rate === 0);
  }

  private queue(action: Action, notBefore?: number): SimEvent[] {
    const now = this.engine.time;
    const spec = this.delayFor(action);
    const delay = Math.round(this.rng.uniform(spec.minSec, spec.maxSec));
    const label = this.label(action);
    const task: PendingTask = {
      id: this.st.nextId++,
      action,
      label,
      orderedT: now,
      dueT: Math.max(now, notBefore ?? now) + delay,
    };
    this.st.pending.push(task);
    return [
      this.say(`readback:${actionCode(action)}`, `${label}. ${this.verb(action)}`, {
        taskId: task.id,
        dueT: task.dueT,
      }),
    ];
  }

  private delayFor(a: Action): DelaySpec {
    const d = this.cfg.delays;
    const pick = (...keys: string[]) =>
      keys.map((k) => d[k]).find(Boolean) ?? { minSec: 30, maxSec: 60 };
    switch (a.kind) {
      case 'drug':
        return this.engine.status().arrest ? pick('drugArrest', 'drug') : pick('drug');
      case 'infusion':
        return pick('infusion', 'drug');
      case 'fluid':
        return pick('fluid');
      case 'device':
        return pick('device');
      case 'order':
        return pick('order');
      case 'procedure': {
        const def = this.lib.devices.procedures.find((p) => p.id === a.procedureId);
        return def?.category === 'team'
          ? pick(`procedure:${a.procedureId}`, 'team')
          : pick(`procedure:${a.procedureId}`, 'procedure');
      }
      default:
        return pick('procedure');
    }
  }

  private safetyCheck(a: Action): Omit<NurseQuery, 'id' | 'action'> | null {
    const c = this.engine.caseDef;
    const pron = c.patient.sex === 'female' ? 'She' : 'He';
    if (a.kind === 'drug' || a.kind === 'infusion') {
      const def = this.lib.formulary.drugs.find((d) => d.id === a.drugId);
      if (!def) return null;
      const allergy = (def.allergyClasses ?? []).find((x) =>
        (c.patient.allergies ?? []).includes(x),
      );
      if (allergy) {
        return {
          kind: 'allergy',
          question: `${pron}'s allergic to ${allergy}. Do you still want ${def.name.toLowerCase()}?`,
        };
      }
      const ci = (def.contraindications ?? []).find((x) => this.engine.check(x.when));
      if (ci) return { kind: 'contraindication', question: `${ci.message} Do you still want it?` };
      const f = this.cfg.doseQueryFactor;
      if (a.kind === 'drug') {
        const r = def.routes.find((x) => x.route === a.route);
        if (r?.maxDose !== undefined && a.dose > r.maxDose * f) {
          return {
            kind: 'dose',
            question: `That's more than ${f} times the usual maximum (${r.maxDose} ${def.unit}). Are you sure?`,
          };
        }
      } else if (def.infusion && a.rate > def.infusion.maxRate * f) {
        return {
          kind: 'dose',
          question: `That rate is more than ${f} times the usual maximum (${def.infusion.maxRate} ${def.infusion.unit}). Are you sure?`,
        };
      }
      const needsLine = a.kind === 'infusion' || a.route === 'IV' || a.route === 'IO';
      const st = this.engine.status();
      const linePending = this.st.pending.some(
        (p) =>
          p.action.kind === 'procedure' &&
          ['iv_access', 'io_access'].includes(p.action.procedureId),
      );
      if (needsLine && !st.access.iv && !st.access.io && !linePending) {
        return {
          kind: 'access',
          question: "There's no IV access yet. Shall I put a cannula in first?",
        };
      }
    }
    if (a.kind === 'fluid') {
      const st = this.engine.status();
      const linePending = this.st.pending.some(
        (p) =>
          p.action.kind === 'procedure' &&
          ['iv_access', 'io_access'].includes(p.action.procedureId),
      );
      if (!st.access.iv && !st.access.io && !linePending) {
        return {
          kind: 'access',
          question: "There's no IV access yet. Shall I put a cannula in first?",
        };
      }
    }
    return null;
  }

  private label(a: Action): string {
    const lib = this.lib;
    switch (a.kind) {
      case 'drug': {
        const d = lib.formulary.drugs.find((x) => x.id === a.drugId);
        return `${d?.name ?? a.drugId} ${a.dose} ${d?.unit ?? ''} ${a.route}`.replace(/\s+/g, ' ');
      }
      case 'infusion': {
        const d = lib.formulary.drugs.find((x) => x.id === a.drugId);
        return `${d?.name ?? a.drugId} infusion at ${a.rate} ${d?.infusion?.unit ?? ''}`.trim();
      }
      case 'fluid': {
        const f = lib.formulary.fluids.find((x) => x.id === a.fluidId);
        return `${a.volumeMl} ml ${(f?.name ?? a.fluidId).toLowerCase()}`;
      }
      case 'device':
        return lib.devices.devices.find((x) => x.id === a.deviceId)?.label ?? a.deviceId;
      case 'procedure':
        return lib.devices.procedures.find((x) => x.id === a.procedureId)?.label ?? a.procedureId;
      case 'order':
        return (
          lib.investigations.investigations.find((x) => x.id === a.investigationId)?.label ??
          a.investigationId
        );
      default:
        return a.kind;
    }
  }

  private verb(a: Action): string {
    if (a.kind === 'drug') return 'Drawing it up now.';
    if (a.kind === 'infusion') return 'Setting up the pump.';
    if (a.kind === 'fluid') return 'Setting up the giving set.';
    if (a.kind === 'order') return 'On it.';
    if (a.kind === 'procedure') {
      const def = this.lib.devices.procedures.find((p) => p.id === a.procedureId);
      return def?.category === 'team' ? 'Making the call.' : 'Getting the kit ready.';
    }
    return 'Doing it now.';
  }

  private say(code: string, text: string, data?: SimEvent['data']): SimEvent {
    const e: SimEvent = { t: this.engine.time, type: 'nurse', code: `nurse:${code}`, text };
    if (data) e.data = data;
    return e;
  }
}

function actionCode(a: Action): string {
  switch (a.kind) {
    case 'drug':
      return `drug:${a.drugId}:${a.route}`;
    case 'infusion':
      return `infusion:${a.drugId}`;
    case 'fluid':
      return `fluid:${a.fluidId}`;
    case 'device':
      return `device:${a.deviceId}`;
    case 'procedure':
      return `procedure:${a.procedureId}`;
    case 'order':
      return `order:${a.investigationId}`;
    default:
      return a.kind;
  }
}

function sameTask(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
