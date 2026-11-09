import { lazy, Suspense, useEffect, useRef } from 'react';
import { useSim } from '../../app/store.ts';
import './debrief.css';

// The debrief (and Recharts) load only when a case ends.
const Debrief = lazy(() => import('./Debrief.tsx'));

export function EndDialog({ onRestart }: { onRestart: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const phase = useSim((s) => s.phase);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (phase === 'ended' && !d.open) d.showModal();
    if (phase !== 'ended' && d.open) d.close();
  }, [phase]);

  return (
    <dialog ref={ref} className="debrief" aria-labelledby="db-title">
      {phase === 'ended' && (
        <Suspense fallback={<p className="dlg">Scoring the case…</p>}>
          <Debrief onRestart={onRestart} onClose={() => ref.current?.close()} />
        </Suspense>
      )}
    </dialog>
  );
}
