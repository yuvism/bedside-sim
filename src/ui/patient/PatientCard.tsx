import { useSim } from '../../app/store.ts';
import { Avatar } from './Avatar.tsx';
import { statusChips } from './chips.ts';
import { describeSigns } from './describe.ts';
import './patient.css';

export function PatientCard() {
  const session = useSim((s) => s.session);
  const view = useSim((s) => s.view);
  const phase = useSim((s) => s.phase);
  if (!session || !view) return null;
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
