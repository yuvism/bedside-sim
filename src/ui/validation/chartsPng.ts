/**
 * Draws the comparison charts to a PNG for the report: one panel per vital,
 * simulated (blue line) and reference (orange line with dots), divergent
 * stretches shaded, with the panel's metrics underneath. Light colours so it
 * prints well whatever the app theme.
 */
import type { ValidationResult } from '../../engine/validation/compare.ts';
import { fmtNum, fmtT, niceTicks, timeTicks, VITAL_INFO } from './vitals.ts';

const W = 1200;
const COLS = 2;
const PANEL_H = 230;
const HEAD = 96;
const PAD = { l: 52, r: 18, t: 30, b: 46 };
const C = {
  bg: '#ffffff',
  ink: '#0b0b0b',
  muted: '#52514e',
  grid: '#e3e8e7',
  sim: '#2a78d6',
  ref: '#eb6834',
  warn: 'rgba(237, 161, 0, 0.18)',
  event: '#9aa3a1',
};

export function drawCharts(
  ctx: CanvasRenderingContext2D,
  r: ValidationResult,
  title: string,
): { width: number; height: number } {
  const rows = Math.ceil(r.vitals.length / COLS);
  const height = HEAD + rows * PANEL_H;
  const pw = W / COLS;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = C.ink;
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, 20, 32);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = C.muted;
  ctx.fillText(
    `Seed ${r.seed} · offset ${r.offsetSec} s · shaded: beyond tolerance · Educational simulation. Simplified physiology. Not clinical guidance.`,
    20,
    54,
  );
  // Legend
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.sim;
  ctx.beginPath();
  ctx.moveTo(20, 76);
  ctx.lineTo(48, 76);
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.fillText('Simulated', 54, 80);
  ctx.strokeStyle = C.ref;
  ctx.beginPath();
  ctx.moveTo(140, 76);
  ctx.lineTo(168, 76);
  ctx.stroke();
  ctx.fillStyle = C.ref;
  ctx.beginPath();
  ctx.arc(154, 76, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.fillText('Reference (video)', 174, 80);

  const maxT = Math.max(
    1,
    r.sim.at(-1)?.t ?? 1,
    ...r.vitals.flatMap((v) => v.pairs.map((p) => p.t)),
  );
  r.vitals.forEach((v, i) => {
    const x0 = (i % COLS) * pw;
    const y0 = HEAD + Math.floor(i / COLS) * PANEL_H;
    const info = VITAL_INFO[v.vital];
    const simPts = r.sim
      .map((s) => ({ t: s.t, v: s[v.vital] }))
      .filter((p): p is { t: number; v: number } => p.v !== null && p.t >= 0);
    const vals = [...simPts.map((p) => p.v), ...v.pairs.map((p) => p.ref), info.lo, info.hi];
    const yt = niceTicks(Math.min(...vals), Math.max(...vals));
    const lo = yt[0] ?? 0;
    const hi = yt[yt.length - 1] ?? 1;
    const px = (t: number) => x0 + PAD.l + (t / maxT) * (pw - PAD.l - PAD.r);
    const py = (y: number) =>
      y0 + PAD.t + (1 - (y - lo) / (hi - lo || 1)) * (PANEL_H - PAD.t - PAD.b);

    ctx.fillStyle = C.ink;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(`${info.title} (${info.unit})`, x0 + PAD.l, y0 + 18);

    for (const d of v.divergences) {
      const a = px(Math.max(0, d.from - 5));
      const b = px(Math.min(maxT, d.to + 5));
      ctx.fillStyle = C.warn;
      ctx.fillRect(a, py(hi), b - a, py(lo) - py(hi));
    }
    ctx.font = '11px system-ui, sans-serif';
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (const y of yt) {
      ctx.beginPath();
      ctx.moveTo(px(0), py(y));
      ctx.lineTo(px(maxT), py(y));
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'right';
      ctx.fillText(String(y), px(0) - 6, py(y) + 4);
    }
    ctx.textAlign = 'center';
    for (const t of timeTicks(maxT)) {
      ctx.fillText(fmtT(t), px(t), py(lo) + 16);
    }
    ctx.textAlign = 'left';
    ctx.strokeStyle = C.event;
    ctx.setLineDash([3, 3]);
    for (const e of r.events.filter((x) => x.action)) {
      ctx.beginPath();
      ctx.moveTo(px(e.t), py(hi));
      ctx.lineTo(px(e.t), py(lo));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = C.sim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    simPts.forEach((p, j) => (j ? ctx.lineTo(px(p.t), py(p.v)) : ctx.moveTo(px(p.t), py(p.v))));
    ctx.stroke();

    const refPts = v.pairs.map((p) => ({ t: p.t, v: p.ref }));
    ctx.strokeStyle = C.ref;
    ctx.beginPath();
    refPts.forEach((p, j) => (j ? ctx.lineTo(px(p.t), py(p.v)) : ctx.moveTo(px(p.t), py(p.v))));
    ctx.stroke();
    ctx.fillStyle = C.ref;
    for (const p of refPts) {
      ctx.beginPath();
      ctx.arc(px(p.t), py(p.v), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const m = v.metrics;
    ctx.fillStyle = C.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      m.n
        ? `n ${m.n} · RMSE ${fmtNum(m.rmse)} · MAE ${fmtNum(m.mae)} · max ${fmtNum(m.maxDev)} at ${fmtT(m.maxDevT)} · tolerance ±${m.tolerance}${m.flagged ? ' · DIVERGES' : ''}`
        : 'No reference readings.',
      x0 + PAD.l,
      y0 + PANEL_H - 10,
    );
  });
  return { width: W, height };
}

/** Renders the charts and resolves with a PNG blob. */
export function chartsPng(r: ValidationResult, title: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const rows = Math.ceil(r.vitals.length / COLS);
  canvas.width = W;
  canvas.height = HEAD + rows * PANEL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is not available.'));
  drawCharts(ctx, r, title);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed.'))), 'image/png'),
  );
}
