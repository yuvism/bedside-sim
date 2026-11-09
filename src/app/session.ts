/**
 * A single play-through of a case: the engine, the recorder, and the bits of
 * bedside state that belong to the monitor and the UI rather than the
 * patient (NIBP cycling, the results inbox, the speech bubble).
 * Framework-free, so it can be driven headlessly in tests.
 */
import { LIBRARY } from '../content/library.ts';
import { SimpleEngine } from '../engine/engine.ts';
import { Recorder } from '../engine/recorder.ts';
import type { Action, CaseDef, EngineLibrary, EngineState, SimEvent } from '../engine/types.ts';

export const NIBP_CYCLE_SEC = 180;

export interface NibpReading {
  sbp: number;
  dbp: number;
  map: number;
  t: number;
}

export interface ResultItem {
  investigationId: string;
  label: string;
  text: string;
  t: number;
  read: boolean;
}

export interface Bubble {
  text: string;
  nonVerbal: boolean;
  t: number;
}

interface Checkpoint {
  engine: EngineState;
  eventCount: number;
  traceCount: number;
  results: ResultItem[];
  nibp: NibpReading | null;
  bubble: Bubble | null;
  nextNibp: number;
}

export class Session {
  readonly engine: SimpleEngine;
  readonly recorder: Recorder;
  readonly caseDef: CaseDef;
  readonly seed: number;
  readonly lib: EngineLibrary;
  nibp: NibpReading | null = null;
  results: ResultItem[] = [];
  bubble: Bubble | null = null;
  /** Saved at the start of every sim minute, for "replay from minute X". */
  readonly snapshots = new Map<number, Checkpoint>();
  private nextNibp = 0;

  /** A new session that resumes `prev` from the start of `minute`. */
  static replay(prev: Session, minute: number): Session {
    const keys = [...prev.snapshots.keys()].filter((m) => m <= minute);
    const m = keys.length ? Math.max(...keys) : 0;
    const cp = prev.snapshots.get(m);
    if (!cp) throw new Error('No checkpoint to replay from.');
    const s = new Session(prev.caseDef, prev.seed, prev.lib);
    s.engine.restore(cp.engine);
    s.recorder.add(prev.events.slice(0, cp.eventCount));
    s.recorder.trace.push(...prev.recorder.trace.slice(0, cp.traceCount));
    s.results = cp.results.map((r) => ({ ...r }));
    s.nibp = cp.nibp;
    s.bubble = cp.bubble;
    s.nextNibp = cp.nextNibp;
    for (const [k, v] of prev.snapshots) if (k <= m) s.snapshots.set(k, v);
    s.recorder.add([
      { t: s.t, type: 'system', code: 'replay', text: `Replaying from minute ${m}.` },
    ]);
    return s;
  }

  private checkpoint(): void {
    const minute = Math.floor(this.t / 60);
    if (this.snapshots.has(minute)) return;
    this.snapshots.set(minute, {
      engine: this.engine.snapshot(),
      eventCount: this.events.length,
      traceCount: this.recorder.trace.length,
      results: this.results.map((r) => ({ ...r })),
      nibp: this.nibp,
      bubble: this.bubble,
      nextNibp: this.nextNibp,
    });
  }

  constructor(caseDef: CaseDef, seed: number, lib: EngineLibrary = LIBRARY) {
    this.caseDef = caseDef;
    this.seed = seed;
    this.lib = lib;
    this.engine = new SimpleEngine(lib);
    this.engine.load(caseDef, seed);
    this.recorder = new Recorder(15);
  }

  get t(): number {
    return this.engine.time;
  }

  get events(): readonly SimEvent[] {
    return this.recorder.events;
  }

  get unread(): number {
    return this.results.filter((r) => !r.read).length;
  }

  start(): SimEvent[] {
    const first = this.caseDef.patient.name.split(' ')[0] ?? 'The patient';
    const evs: SimEvent[] = [
      { t: this.t, type: 'system', code: 'arrive', text: `${first} arrives in resus.` },
      { t: this.t, type: 'patient', code: 'line:opening', text: this.caseDef.openingLine },
    ];
    this.absorb(evs);
    this.recorder.sample(this.t, this.engine.vitals(), true);
    this.measureNibp(false);
    this.checkpoint();
    return evs;
  }

  /** Advance sim time; returns the events that happened. */
  advance(dtSec: number): SimEvent[] {
    const evs = this.engine.step(dtSec);
    this.absorb(evs);
    this.recorder.sample(this.t, this.engine.vitals());
    if (this.t >= this.nextNibp) this.measureNibp(false);
    // Taken on the first tick of each new minute (within one loop step of it).
    this.checkpoint();
    return evs;
  }

  act(action: Action): SimEvent[] {
    const evs = this.engine.apply(action);
    this.absorb(evs);
    return evs;
  }

  /** Take a cuff reading now. Manual readings are logged; automatic cycles are not. */
  measureNibp(manual: boolean): SimEvent | null {
    const v = this.engine.vitals();
    this.nextNibp = this.t + NIBP_CYCLE_SEC;
    if (v.sbp === null || v.dbp === null || v.map === null) {
      this.nibp = null;
      if (!manual) return null;
      const e: SimEvent = {
        t: this.t,
        type: 'warn',
        code: 'monitor:nibp',
        text: 'NIBP: unable to measure.',
      };
      this.absorb([e]);
      return e;
    }
    this.nibp = {
      sbp: Math.round(v.sbp),
      dbp: Math.round(v.dbp),
      map: Math.round(v.map),
      t: this.t,
    };
    if (!manual) return null;
    const { sbp, dbp, map } = this.nibp;
    const e: SimEvent = {
      t: this.t,
      type: 'finding',
      code: 'monitor:nibp',
      text: `NIBP ${sbp}/${dbp} (${map}).`,
    };
    this.absorb([e]);
    return e;
  }

  markRead(investigationId?: string): void {
    for (const r of this.results) {
      if (!investigationId || r.investigationId === investigationId) r.read = true;
    }
  }

  private absorb(evs: readonly SimEvent[]): void {
    this.recorder.add(evs);
    for (const e of evs) {
      if (e.type === 'result') {
        const id = e.code.slice('result:'.length);
        const label = this.lib.investigations.investigations.find((i) => i.id === id)?.label ?? id;
        const text = e.text.startsWith(`${label}: `) ? e.text.slice(label.length + 2) : e.text;
        this.results = [{ investigationId: id, label, text, t: e.t, read: false }, ...this.results];
      } else if (e.type === 'patient') {
        const nonVerbal = e.data?.['nonVerbal'] === true || e.text.startsWith('(');
        this.bubble = { text: e.text, nonVerbal, t: e.t };
      }
    }
  }
}
