import type { Session } from '../../app/session.ts';
import { useSim } from '../../app/store.ts';
import { Avatar } from './Avatar.tsx';
import { statusChips } from './chips.ts';
import { describeSigns } from './describe.ts';
import './patient.css';

/** Guided mode only: is the patient getting better or worse over the last minute or so? */
function trendOf(session: Session, now: Record<string, number>): string | null {
  const minute = Math.floor(session.t / 60) - 1;
  const then = session.snapshots.get(minute)?.engine.processes;
  if (!then) return null;
  const delta =
    Object.values(now).reduce((a, b) => a + b, 0) - then.reduce((a, p) => a + p.severity, 0);
  return delta > 2 ? 'worsening' : delta < -2 ? 'improving' : 'steady';
}

export function PatientCard() {
  const session = useSim((s) => s.session);
  const view = useSim((s) => s.view);
  const phase = useSim((s) => s.phase);
  const mode = useSim((s) => s.mode);
  if (!session || !view) return null;
  const trend = trendOf(session, view.severities);
  const p = session.caseDef.patient;
  const first = p.name.split(' ')[0] ?? p.name;
  const arrest = view.status.arrest;
  const bubble = view.bubble;
  const bubbleText =
    phase === 'brief'
      ? 'Waiting for you to start.'
      : bubble
        ? bubble.nonVerbal
          ? bubble.text
          : `“${bubble.text}”`
        : '…';
  const silent = phase === 'brief' || !bubble || bubble.nonVerbal;
  return (
    <section className="card patient" aria-label="Patient">
      <Avatar
        signs={phase === 'brief' ? {} : view.signs}
        rr={phase === 'running' ? view.vitals.rr : 0}
        arrest={arrest}
        label={
          phase === 'brief'
            ? `${first}, before you start.`
            : describeSigns(view.signs, arrest, first, p.sex === 'female' ? 'her' : 'his')
        }
      />
      <div className="patient-body">
        <p className="who">
          {p.name}{' '}
          <span>
            · {p.age} · {p.occupation ?? (p.sex === 'male' ? 'man' : 'woman')}
          </span>
        </p>
        <div className={`bubble${silent ? ' silent' : ''}`} aria-live="polite">
          {bubbleText}
        </div>
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
      </div>
    </section>
  );
}
