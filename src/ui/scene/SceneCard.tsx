/**
 * The patient at the centre of the bedside: an illustrated resus bay seen
 * from the foot of the bed (or the optional 3D bay). The patient, monitor,
 * drip stand, crash trolley and oxygen outlet can be clicked, like the 3D
 * view; the buttons under the scene do the same for keyboard users.
 */
import type { Session } from '../../app/session.ts';
import { useSim } from '../../app/store.ts';
import { activate } from '../bay/activate.ts';
import { BAY_TARGETS, bayStateOf, TARGET_LABELS } from '../bay/bayModel.ts';
import { BayCard, ViewToggle } from '../bay/BayView.tsx';
import { Avatar } from '../patient/Avatar.tsx';
import { statusChips } from '../patient/chips.ts';
import { describeSigns } from '../patient/describe.ts';
import { Bed, CrashTrolley, Defs, DripStand, IvLine, Room, WallMonitor } from './BedArt.tsx';
import { PatientArt } from './PatientArt.tsx';
import '../patient/patient.css';
import './scene.css';

/** Guided mode only: is the patient getting better or worse over the last minute or so? */
function trendOf(session: Session, now: Record<string, number>): string | null {
  const minute = Math.floor(session.t / 60) - 1;
  const then = session.snapshots.get(minute)?.engine.processes;
  if (!then) return null;
  const delta =
    Object.values(now).reduce((a, b) => a + b, 0) - then.reduce((a, p) => a + p.severity, 0);
  return delta > 2 ? 'worsening' : delta < -2 ? 'improving' : 'steady';
}

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '--' : String(Math.round(v));

export function SceneCard({ bay }: { bay: number | null }) {
  const session = useSim((s) => s.session);
  const view = useSim((s) => s.view);
  const phase = useSim((s) => s.phase);
  const mode = useSim((s) => s.mode);
  const bayView = useSim((s) => s.bayView);
  if (!session || !view) return null;

  const live = phase !== 'brief';
  const p = session.caseDef.patient;
  const first = p.name.split(' ')[0] ?? p.name;
  const arrest = view.status.arrest;
  const signs = live ? view.signs : {};
  const state = bayStateOf(view.status, signs, view.vitals, phase === 'running');
  const trend = trendOf(session, view.severities);
  const bubble = view.bubble;
  // An unresponsive patient says nothing, whatever they said last.
  const caption = !live
    ? 'Waiting for you to start.'
    : arrest
      ? null
      : bubble
        ? bubble.nonVerbal
          ? bubble.text
          : `“${bubble.text}”`
        : null;
  const label = live
    ? describeSigns(signs, arrest, first, p.sex === 'female' ? 'her' : 'his')
    : `${first}, before you start.`;
  const drop = state.reclined ? 0 : 12;

  return (
    <section className="card scene-card" aria-label="Patient">
      <div className={`scene-stage${bayView === '3d' ? ' is-3d' : ''}`}>
        {bayView === '3d' ? (
          <BayCard />
        ) : (
          <svg
            className="bed-scene"
            viewBox="0 0 800 450"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={label}
          >
            <Defs />
            <Room bay={bay} onPick={activate} />
            <WallMonitor
              hr={live ? fmt(view.vitals.hr) : '--'}
              spo2={live ? fmt(view.vitals.spo2) : '--'}
              bp={live && view.nibp ? `${view.nibp.sbp}/${view.nibp.dbp}` : '--/--'}
              onPick={activate}
            />
            <DripStand drip={state.drip} onPick={activate} />
            <Bed>
              <PatientArt state={state} signs={signs} live={live} onPick={activate} />
            </Bed>
            {state.drip && state.ivAccess && <IvLine drop={drop} />}
            <CrashTrolley onPick={activate} />
          </svg>
        )}
        <p className="scene-who">
          <strong>{p.name}</strong> · {p.age} ·{' '}
          {p.occupation ?? (p.sex === 'male' ? 'man' : 'woman')}
        </p>
        {bayView === '2d' && (
          <div className="scene-closeup" aria-hidden="true">
            <Avatar
              signs={signs}
              rr={phase === 'running' ? view.vitals.rr : 0}
              arrest={arrest}
              label=""
            />
            <span>Face</span>
          </div>
        )}
        <div className={`scene-caption${caption ? '' : ' empty'}`} aria-live="polite">
          {caption}
        </div>
      </div>
      <div className="scene-strip">
        <ul className="chips" aria-label="Current interventions">
          {mode === 'guided' && phase === 'running' && trend && (
            <li className={`chip trend ${trend}`}>Trend: {trend}</li>
          )}
          {statusChips(view.status).map((c) => (
            <li key={c.text} className={`chip${c.on ? ' on' : ''}`}>
              {c.text}
            </li>
          ))}
        </ul>
        {bayView === '2d' && <p className="scene-hint">Click the patient or the equipment</p>}
        <ViewToggle />
      </div>
      {bayView === '2d' && (
        <div className="bay-objects scene-objects" role="group" aria-label="Bedside objects">
          {BAY_TARGETS.map((t) => (
            <button key={t} type="button" className="btn small" onClick={() => activate(t)}>
              {TARGET_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
