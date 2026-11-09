import { Component, lazy, Suspense, type ReactNode } from 'react';
import { useSim } from '../../app/store.ts';
import './bay.css';

const Bay3D = lazy(() => import('./Bay3D.tsx'));

/** 2D (default) or 3D bedside view. */
export function ViewToggle() {
  const view = useSim((s) => s.bayView);
  const setView = useSim((s) => s.setBayView);
  return (
    <div className="view-toggle" role="group" aria-label="Bedside view">
      {(['2d', '3d'] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={`btn small${view === v ? ' is-on' : ''}`}
          aria-pressed={view === v}
          onClick={() => setView(v)}
        >
          {v === '2d' ? '2D view' : '3D view'}
        </button>
      ))}
    </div>
  );
}

class LoadGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <p className="hint warn" role="status">
          The 3D view couldn’t start. The download may have failed, or this browser may not support
          WebGL. Switch back to 2D.
        </p>
      );
    }
    return this.props.children;
  }
}

export function BayCard() {
  return (
    <section className="card bay" aria-label="3D bedside view">
      <LoadGuard>
        <Suspense fallback={<p className="hint bay-loading">Loading the 3D view…</p>}>
          <Bay3D />
        </Suspense>
      </LoadGuard>
      <p className="hint">
        Drag to look around. Select the patient, monitor, drip stand, trolley or oxygen outlet.
      </p>
    </section>
  );
}
