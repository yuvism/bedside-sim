import { useEffect, useRef } from 'react';
import { useSim } from '../../app/store.ts';
import { fmtClock } from '../format.ts';
import './debrief.css';

const TITLES = {
  stabilised: (n: string) => `${n} is stable`,
  arrest: (n: string) => `${n} arrested`,
  ended: () => 'Case ended',
} as const;

export function EndDialog({ onRestart }: { onRestart: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const phase = useSim((s) => s.phase);
  const reason = useSim((s) => s.endReason);
  const session = useSim((s) => s.session);
  const t = useSim((s) => s.view?.t ?? 0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (phase === 'ended' && !d.open) d.showModal();
    if (phase !== 'ended' && d.open) d.close();
  }, [phase]);

  const first = session?.caseDef.patient.name.split(' ')[0] ?? 'Patient';
  return (
    <dialog ref={ref} className="debrief" aria-labelledby="db-title">
      <div className="dlg">
        <h2 id="db-title">{reason ? TITLES[reason](first) : 'Case review'}</h2>
        <p className="muted">
          Case time {fmtClock(t)} · {session?.caseDef.title}
        </p>
        <div className="row">
          <button className="btn primary" onClick={onRestart}>
            Restart case
          </button>
          <button className="btn" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
