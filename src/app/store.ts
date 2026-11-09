/**
 * The bedside store. Holds one Session and a render-friendly view of it that
 * is refreshed after every tick or action. Components subscribe to slices.
 */
import { create } from 'zustand';
import type { EngineStatus } from '../engine/engine.ts';
import type { Action, CaseDef, SimEvent, Signs, Vitals } from '../engine/types.ts';
import { lastDiagnosis, scoreRun, type ScoreResult } from '../engine/scoring.ts';
import { recordAttempt, type CaseProgress } from './progress.ts';
import { Session, type Bubble, type NibpReading, type ResultItem } from './session.ts';

export const SPEEDS = [1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];
export type Phase = 'brief' | 'running' | 'ended';
export type EndReason = 'stabilised' | 'died' | 'ended';

/** Real milliseconds between an outcome and the case closing, so the moment is visible. */
export const OUTCOME_GRACE_MS = 1800;

export interface SimView {
  t: number;
  vitals: Vitals;
  signs: Signs;
  severities: Record<string, number>;
  status: EngineStatus;
  nibp: NibpReading | null;
  results: ResultItem[];
  unread: number;
  bubble: Bubble | null;
  events: SimEvent[];
}

interface SimState {
  session: Session | null;
  phase: Phase;
  paused: boolean;
  speed: Speed;
  diagnosis: string;
  endReason: EndReason | null;
  endScheduled: boolean;
  view: SimView | null;
  score: ScoreResult | null;
  progress: CaseProgress | null;
  load(caseDef: CaseDef, seed: number): void;
  start(): void;
  togglePause(): void;
  setSpeed(s: Speed): void;
  /** Called by the clock loop with real elapsed seconds. */
  advance(realSec: number): void;
  act(action: Action): SimEvent[];
  cycleNibp(): void;
  setDiagnosis(id: string): void;
  markRead(investigationId?: string): void;
  end(reason: EndReason): void;
  /** Resume this run from the start of a sim minute, paused. */
  replayFrom(minute: number): void;
}

function viewOf(s: Session, prev: SimView | null): SimView {
  const e = s.engine;
  const events = prev && prev.events.length === s.events.length ? prev.events : [...s.events];
  return {
    t: s.t,
    vitals: e.vitals(),
    signs: e.signs(),
    severities: e.severities(),
    status: e.status(),
    nibp: s.nibp,
    results: s.results.map((r) => ({ ...r })),
    unread: s.unread,
    bubble: s.bubble,
    events,
  };
}

export const useSim = create<SimState>()((set, get) => {
  const refresh = () => {
    const { session, view } = get();
    if (session) set({ view: viewOf(session, view) });
  };

  const watchOutcome = () => {
    const { session, endScheduled, phase } = get();
    const outcome = session?.engine.status().outcome;
    if (!outcome || endScheduled || phase !== 'running') return;
    set({ endScheduled: true });
    setTimeout(() => {
      if (get().session === session) get().end(outcome);
    }, OUTCOME_GRACE_MS);
  };

  return {
    session: null,
    phase: 'brief',
    paused: false,
    speed: 4,
    diagnosis: '',
    endReason: null,
    endScheduled: false,
    view: null,
    score: null,
    progress: null,

    load(caseDef, seed) {
      const session = new Session(caseDef, seed);
      set({
        session,
        phase: 'brief',
        paused: false,
        diagnosis: '',
        endReason: null,
        endScheduled: false,
        score: null,
        progress: null,
        view: viewOf(session, null),
      });
    },

    start() {
      const { session, phase } = get();
      if (!session || phase !== 'brief') return;
      session.start();
      set({ phase: 'running', paused: false });
      refresh();
    },

    togglePause() {
      if (get().phase === 'running') set({ paused: !get().paused });
    },

    setSpeed(speed) {
      set({ speed });
    },

    advance(realSec) {
      const { session, phase, paused, speed } = get();
      if (!session || phase !== 'running' || paused || get().endScheduled) return;
      session.advance(realSec * speed);
      refresh();
      watchOutcome();
    },

    act(action) {
      const { session, phase } = get();
      if (!session || phase !== 'running') return [];
      const evs = session.act(action);
      if (action.kind === 'diagnosis') set({ diagnosis: action.diagnosisId });
      refresh();
      return evs;
    },

    cycleNibp() {
      const { session, phase } = get();
      if (!session || phase !== 'running') return;
      session.measureNibp(true);
      refresh();
    },

    setDiagnosis(id) {
      if (!id) {
        set({ diagnosis: '' });
        return;
      }
      get().act({ kind: 'diagnosis', diagnosisId: id });
    },

    markRead(investigationId) {
      get().session?.markRead(investigationId);
      refresh();
    },

    end(reason) {
      const { session, phase } = get();
      if (!session || phase === 'ended') return;
      if (reason === 'ended') {
        session.recorder.add([
          { t: session.t, type: 'system', code: 'ended', text: 'Case ended by the clinician.' },
        ]);
      }
      session.recorder.sample(session.t, session.engine.vitals(), true);
      const st = session.engine.status();
      const outcome = st.outcome ?? (st.arrest ? 'arrest' : 'ended');
      const score = scoreRun(session.caseDef, {
        events: session.events,
        trace: session.recorder.trace,
        outcome,
        diagnosis: lastDiagnosis(session.events),
      });
      const progress = recordAttempt(session.caseDef.id, score.percent, outcome);
      set({ phase: 'ended', endReason: reason, paused: false, score, progress });
      refresh();
    },

    replayFrom(minute) {
      const { session } = get();
      if (!session) return;
      const next = Session.replay(session, minute);
      set({
        session: next,
        phase: 'running',
        paused: true,
        endReason: null,
        endScheduled: false,
        score: null,
        diagnosis: lastDiagnosis(next.events) ?? '',
        view: viewOf(next, null),
      });
    },
  };
});
