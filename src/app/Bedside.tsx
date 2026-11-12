import { useEffect, useRef } from 'react';
import type { CaseDef } from '../engine/types.ts';
import { EndDialog } from '../ui/debrief/EndDialog.tsx';
import { fmtClock } from '../ui/format.ts';
import { EventLog } from '../ui/log/EventLog.tsx';
import { monitorAudio } from '../ui/monitor/audio.ts';
import { Monitor } from '../ui/monitor/Monitor.tsx';
import { ActionPanels } from '../ui/panels/ActionPanels.tsx';
import { AlsPanel } from '../ui/panels/AlsPanel.tsx';
import { NursePanel } from '../ui/panels/NursePanel.tsx';
import { Footer } from './Footer.tsx';
import { editorHref } from './router.ts';
import { SPEEDS, useSim, type PanelTab } from './store.ts';
import { HowToPlay } from '../ui/HowToPlay.tsx';
import { SceneCard } from '../ui/scene/SceneCard.tsx';
import { SettingsButton } from '../ui/settings/SettingsButton.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import './bedside.css';

const TICK_MS = 250;

const PANEL_KEYS: Record<string, PanelTab> = {
  '1': 'talk',
  '2': 'exam',
  '3': 'tests',
  '4': 'treat',
};

/** Space pauses or resumes; 1–4 switch panels. Ignored while typing. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        el &&
        (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY|A)$/.test(el.tagName))
      )
        return;
      const st = useSim.getState();
      if (e.key === ' ' && st.phase === 'running') {
        e.preventDefault();
        st.togglePause();
      } else if (PANEL_KEYS[e.key]) {
        st.setPanel(PANEL_KEYS[e.key] as PanelTab);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Drives sim time from real time while the case runs. */
function useSimLoop() {
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, Math.max(0, (now - last) / 1000));
      last = now;
      useSim.getState().advance(dt);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);
}

function Controls() {
  const speed = useSim((s) => s.speed);
  const setSpeed = useSim((s) => s.setSpeed);
  const paused = useSim((s) => s.paused);
  const phase = useSim((s) => s.phase);
  const togglePause = useSim((s) => s.togglePause);
  const t = useSim((s) => s.view?.t ?? 0);
  return (
    <>
      <div className="speed-wrap">
        <span className="speed-label" aria-hidden="true">
          Speed
        </span>
        <div className="speed" role="group" aria-label="Simulation speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              aria-pressed={speed === s}
              title={
                s === 1
                  ? 'Real time: one simulated minute takes one minute'
                  : `${s}× faster: one simulated minute takes ${Math.round(60 / s)} seconds`
              }
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      <button className="btn" onClick={togglePause} disabled={phase !== 'running'}>
        {paused ? 'Resume' : 'Pause'}
      </button>
      <div className="clock">
        <span aria-label={`Case time ${fmtClock(t)}`}>{fmtClock(t)}</span>
        <small>{paused ? 'paused' : 'since arrival'}</small>
      </div>
    </>
  );
}

function ModeBadge() {
  const mode = useSim((s) => s.mode);
  const phase = useSim((s) => s.phase);
  if (phase === 'brief') return null;
  return <span className={`mode-badge ${mode}`}>{mode === 'exam' ? 'Exam' : 'Guided'}</span>;
}

function useAge(caseDef: CaseDef): number {
  // The varied patient's age, not the authored one.
  return useSim((s) => s.session?.caseDef.patient.age ?? caseDef.patient.age);
}

function BriefCard({ caseDef, bay }: { caseDef: CaseDef; bay: number | null }) {
  const start = useSim((s) => s.start);
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);
  const age = useAge(caseDef);
  return (
    <section className="card brief" aria-labelledby="brief-h">
      <p className="eyebrow">Handover{bay ? ` · Bay ${bay}` : ''}</p>
      <h2 id="brief-h">{caseDef.title}</h2>
      {caseDef.brief.map((p) => (
        <p key={p.slice(0, 24)}>{p.replaceAll('{age}', String(age))}</p>
      ))}
      <fieldset className="mode-pick">
        <legend>Mode</legend>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'guided'}
            onChange={() => setMode('guided')}
          />
          <span>
            <strong>Guided</strong>: the nurse prompts you when you stall, teaching notes appear as
            you go, and a trend chip shows whether the patient is improving.
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'exam'}
            onChange={() => setMode('exam')}
          />
          <span>
            <strong>Exam</strong>: no prompts or hints, and an OSCE-style breakdown with a pass mark
            at the end.
          </span>
        </label>
      </fieldset>
      <button
        className="btn primary"
        onClick={() => {
          monitorAudio.unlock();
          start();
        }}
      >
        Start case
      </button>
    </section>
  );
}

/** Re-read the handover during the case. */
function BriefButton({ caseDef }: { caseDef: CaseDef }) {
  const ref = useRef<HTMLDialogElement>(null);
  const phase = useSim((s) => s.phase);
  const age = useAge(caseDef);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={phase === 'brief'}
        title="Read the handover again"
        onClick={() => ref.current?.showModal()}
      >
        Brief
      </button>
      <dialog ref={ref} className="brief-dialog" aria-labelledby="brief-dlg-h">
        <h2 id="brief-dlg-h">{caseDef.title}</h2>
        {caseDef.brief.map((p) => (
          <p key={p.slice(0, 24)}>{p.replaceAll('{age}', String(age))}</p>
        ))}
        <button type="button" className="btn primary" onClick={() => ref.current?.close()}>
          Back to the patient
        </button>
      </dialog>
    </>
  );
}

export function Bedside({
  caseDef,
  seed,
  draftId,
  blind = false,
  bay = null,
}: {
  caseDef: CaseDef;
  seed: number;
  /** Set when test-running an editor draft. */
  draftId?: string;
  /** The bed space, as on the department board. */
  bay?: number | null;
  /** "Unknown patient": don't show the specialty, which hints at the diagnosis. */
  blind?: boolean;
}) {
  const phase = useSim((s) => s.phase);
  const load = useSim((s) => s.load);
  const testRun = draftId !== undefined;
  useEffect(() => load(caseDef, seed, { testRun }), [caseDef, seed, load, testRun]);
  useSimLoop();
  useShortcuts();

  return (
    <>
      <header className="bar sim-bar">
        <div className="brand">
          <h1>
            <a href="#/">Bedside sim</a>
          </h1>
          <p>
            {bay ? `Bay ${bay} · ` : ''}
            {blind ? 'Unknown patient' : caseDef.specialty} · {caseDef.title}
          </p>
        </div>
        {draftId !== undefined && (
          <a className="btn" href={editorHref(draftId)}>
            Back to editor
          </a>
        )}
        <BriefButton caseDef={caseDef} />
        <Controls />
        <ModeBadge />
        <SettingsButton />
        <ThemeToggle />
      </header>
      <main className="page bedside console">
        <SceneCard bay={bay} />
        <Monitor />
        <div className="side">
          <AlsPanel />
          <NursePanel />
          <ActionPanels />
          <EventLog />
        </div>
        {phase === 'brief' && (
          <div className="handover" role="region" aria-label="Handover">
            <div className="handover-inner">
              {testRun && (
                <p className="test-run-note" role="note">
                  Test run of an editor draft. The result isn’t saved to your progress.
                </p>
              )}
              <BriefCard caseDef={caseDef} bay={bay} />
              <HowToPlay />
            </div>
          </div>
        )}
      </main>
      <EndDialog
        onRestart={() => load(caseDef, seed, { testRun })}
        back={
          blind
            ? { href: '#/patients', label: 'Back to patients' }
            : testRun
              ? { href: '#/', label: 'Back to cases' }
              : { href: '#/topics', label: 'Back to topics' }
        }
      />
      <Footer seed={seed} />
    </>
  );
}
