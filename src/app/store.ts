/**
 * The bedside store. Holds one Session and a render-friendly view of it that
 * is refreshed after every tick or action. Components subscribe to slices.
 */
import { create } from 'zustand';
import type { EngineStatus } from '../engine/engine.ts';
import type { Action, CaseDef, SimEvent, Signs, Vitals } from '../engine/types.ts';
import type { Mode } from '../engine/coach.ts';
import { lastDiagnosis, scoreRun, type ScoreResult } from '../engine/scoring.ts';
import type { NurseQuery, PendingTask } from '../engine/team.ts';
import { loadAiSettings, saveAiSettings, type AiSettings } from './aiSettings.ts';
import { resolveQuestion } from './patientChat.ts';
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
  tasks: PendingTask[];
  queries: NurseQuery[];
}

export type PanelTab = 'talk' | 'exam' | 'tests' | 'treat';
export type BayView = '2d' | '3d';

const VIEW_KEY = 'bedside-sim:view';
function readView(): BayView {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(VIEW_KEY) === '3d'
      ? '3d'
      : '2d';
  } catch {
    return '2d';
  }
}

const MODE_KEY = 'bedside-sim:mode';
function readMode(): Mode {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(MODE_KEY) === 'exam'
      ? 'exam'
      : 'guided';
  } catch {
    return 'guided';
  }
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
  mode: Mode;
  /** Optional AI patient settings (key kept in localStorage only). */
  ai: AiSettings;
  /** Open action panel tab. */
  panel: PanelTab;
  /** 2D panel view (default) or the 3D resus bay. */
  bayView: BayView;
  /** A typed question is waiting for its answer. */
  asking: boolean;
  /** Why the last typed question fell back to the offline matcher. */
  askNotice: string | null;
  load(caseDef: CaseDef, seed: number): void;
  /** Switch guided/exam before starting (reloads the same patient). */
  setMode(mode: Mode): void;
  /** Answer the nurse's query about an order. */
  answer(queryId: number, proceed: boolean): void;
  start(): void;
  togglePause(): void;
  setSpeed(s: Speed): void;
  /** Called by the clock loop with real elapsed seconds. */
  advance(realSec: number): void;
  act(action: Action): SimEvent[];
  /** Ask the patient a free-text question (offline matcher, or Claude with a key). */
  ask(text: string): Promise<void>;
  setAi(ai: AiSettings): void;
  setPanel(tab: PanelTab): void;
  setBayView(v: BayView): void;
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
    tasks: [...(s.nurse?.pending ?? [])],
    queries: [...(s.nurse?.queries ?? [])],
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
    mode: readMode(),
    ai: loadAiSettings(),
    panel: 'talk',
    bayView: readView(),
    asking: false,
    askNotice: null,

    load(caseDef, seed) {
      const session = new Session(caseDef, seed, undefined, { mode: get().mode });
      set({
        session,
        phase: 'brief',
        paused: false,
        diagnosis: '',
        endReason: null,
        endScheduled: false,
        score: null,
        progress: null,
        asking: false,
        askNotice: null,
        panel: 'talk',
        view: viewOf(session, null),
      });
    },

    setMode(mode) {
      try {
        window.localStorage.setItem(MODE_KEY, mode);
      } catch {
        /* storage unavailable */
      }
      set({ mode });
      const { session, phase } = get();
      if (session && phase === 'brief') get().load(session.baseCase, session.seed);
    },

    answer(queryId, proceed) {
      const { session, phase } = get();
      if (!session || phase !== 'running') return;
      session.answer(queryId, proceed);
      refresh();
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

    async ask(text) {
      const { session, phase, ai, asking } = get();
      if (!session || phase !== 'running' || asking || !text.trim()) return;
      set({ asking: true, askNotice: null });
      try {
        const r = await resolveQuestion(session, text, ai);
        // The case may have ended or been reloaded while Claude was answering.
        if (get().session !== session || get().phase !== 'running') return;
        get().act(r.action);
        set({ askNotice: r.notice });
      } finally {
        set({ asking: false });
      }
    },

    setAi(ai) {
      saveAiSettings(ai);
      set({ ai, askNotice: null });
    },

    setPanel(panel) {
      set({ panel });
    },

    setBayView(bayView) {
      try {
        window.localStorage.setItem(VIEW_KEY, bayView);
      } catch {
        /* storage unavailable */
      }
      set({ bayView });
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
