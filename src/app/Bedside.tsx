import { useEffect } from 'react';
import type { CaseDef } from '../engine/types.ts';
import { EndDialog } from '../ui/debrief/EndDialog.tsx';
import { fmtClock } from '../ui/format.ts';
import { EventLog } from '../ui/log/EventLog.tsx';
import { monitorAudio } from '../ui/monitor/audio.ts';
import { Monitor } from '../ui/monitor/Monitor.tsx';
import { ActionPanels } from '../ui/panels/ActionPanels.tsx';
import { AlsPanel } from '../ui/panels/AlsPanel.tsx';
import { NursePanel } from '../ui/panels/NursePanel.tsx';
import { PatientCard } from '../ui/patient/PatientCard.tsx';
import { Footer } from './Footer.tsx';
import { SPEEDS, useSim } from './store.ts';
import { BayCard, ViewToggle } from '../ui/bay/BayView.tsx';
import { SettingsButton } from '../ui/settings/SettingsButton.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

const TICK_MS = 250;

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
      <div className="speed" role="group" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
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

function BriefCard({ caseDef }: { caseDef: CaseDef }) {
  const start = useSim((s) => s.start);
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);
  // The varied patient's age, not the authored one.
  const age = useSim((s) => s.session?.caseDef.patient.age ?? caseDef.patient.age);
  return (
    <section className="card brief" aria-labelledby="brief-h">
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

export function Bedside({ caseDef, seed }: { caseDef: CaseDef; seed: number }) {
  const phase = useSim((s) => s.phase);
  const load = useSim((s) => s.load);
  const bayView = useSim((s) => s.bayView);
  useEffect(() => load(caseDef, seed), [caseDef, seed, load]);
  useSimLoop();

  return (
    <>
      <header className="bar">
        <div className="brand">
          <h1>
            <a href="#/">Bedside sim</a>
          </h1>
          <p>
            {caseDef.specialty} · {caseDef.title}
          </p>
        </div>
        <Controls />
        <ModeBadge />
        <SettingsButton />
        <ThemeToggle />
      </header>
      <main className="page bedside">
        <div className="col">
          <Monitor />
          <ViewToggle />
          {bayView === '3d' && <BayCard />}
          <PatientCard hideAvatar={bayView === '3d'} />
          {phase === 'brief' && <BriefCard caseDef={caseDef} />}
        </div>
        <div className="col">
          <AlsPanel />
          <NursePanel />
          <ActionPanels />
          <EventLog />
        </div>
      </main>
      <EndDialog onRestart={() => load(caseDef, seed)} />
      <Footer seed={seed} />
    </>
  );
}
