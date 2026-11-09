/**
 * The 3D resus bay. Loaded lazily (three.js is a separate chunk) and only when
 * the user switches to the 3D view; 2D stays the default.
 */
import { useEffect, useRef, useState } from 'react';
import { useSim } from '../../app/store.ts';
import { activate } from './activate.ts';
import { BAY_TARGETS, bayStateOf, TARGET_LABELS } from './bayModel.ts';
import { Bay } from './scene.ts';
import './bay.css';

function isDark(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function hasWebGL(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

interface Tip {
  label: string;
  x: number;
  y: number;
}

export default function Bay3D() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed] = useState(() => !hasWebGL());
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    // A failure here reaches the LoadGuard error boundary around this view.
    const bay = new Bay(canvas, {
      dark: isDark(),
      onPick: activate,
      onFps: (fps) => {
        stage.dataset['fps'] = String(fps);
      },
      onHover: (t, x, y) => {
        const r = stage.getBoundingClientRect();
        setTip(t ? { label: TARGET_LABELS[t], x: x - r.left, y: y - r.top } : null);
      },
      readScreen: () => {
        const s = useSim.getState();
        if (!s.view) return null;
        return { vitals: s.view.vitals, nibp: s.view.nibp, live: s.phase !== 'brief' };
      },
    });

    const push = () => {
      const s = useSim.getState();
      if (s.view) {
        bay.setState(bayStateOf(s.view.status, s.view.signs, s.view.vitals, s.phase === 'running'));
      }
    };
    push();
    const unsub = useSim.subscribe(push);

    const fit = () => bay.resize(stage.clientWidth, stage.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    // Render only while on screen.
    const io = new IntersectionObserver(([e]) => bay.setActive(e?.isIntersecting ?? false));
    io.observe(stage);

    const onTheme = () => bay.setTheme(isDark());
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', onTheme);

    return () => {
      unsub();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      mq?.removeEventListener('change', onTheme);
      bay.dispose();
    };
  }, []);

  if (failed) {
    return (
      <p className="hint warn" role="status">
        The 3D view needs WebGL, which this browser doesn’t offer. Switch back to 2D.
      </p>
    );
  }

  return (
    <>
      <div ref={stageRef} className="bay-stage">
        <canvas ref={canvasRef} aria-hidden="true" />
        {tip && (
          <div className="bay-tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
            {tip.label}
          </div>
        )}
      </div>
      <div className="bay-objects" role="group" aria-label="Bedside objects">
        {BAY_TARGETS.map((t) => (
          <button key={t} type="button" className="btn small" onClick={() => activate(t)}>
            {TARGET_LABELS[t]}
          </button>
        ))}
      </div>
    </>
  );
}
