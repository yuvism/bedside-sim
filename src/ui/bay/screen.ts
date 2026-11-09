/**
 * Draws the 3D monitor's screen: the live waveform canvas on the left and the
 * numbers on the right, like the 2D monitor. Redrawn a few times a second.
 */
import type { Vitals } from '../../engine/types.ts';

export interface ScreenReading {
  vitals: Vitals;
  nibp: { sbp: number; dbp: number; map: number } | null;
  live: boolean;
}

export const SCREEN_W = 512;
export const SCREEN_H = 320;
const TRACE_W = 330;

/** Same colours as the 2D monitor (theme.css). */
const COLOURS = { hr: '#3ce07a', spo2: '#3fd0f0', bp: '#ff6b63', rr: '#f2d04a', co2: '#d9e2e0' };

const show = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '--' : String(Math.round(n));

export function drawScreen(
  ctx: CanvasRenderingContext2D,
  trace: HTMLCanvasElement | null,
  r: ScreenReading | null,
): void {
  ctx.fillStyle = '#05100e';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  if (trace && trace.width > 0 && trace.height > 0) {
    ctx.drawImage(trace, 0, 0, trace.width, trace.height, 0, 0, TRACE_W, SCREEN_H);
  }
  ctx.fillStyle = '#16302b';
  ctx.fillRect(TRACE_W, 0, 2, SCREEN_H);
  if (!r) return;
  const v = r.vitals;
  const rows: [string, string, string, number][] = [
    ['HR', show(r.live ? v.hr : null), COLOURS.hr, 64],
    ['SpO₂', show(r.live ? v.spo2 : null), COLOURS.spo2, 56],
    ['NIBP', r.nibp ? `${r.nibp.sbp}/${r.nibp.dbp}` : '--/--', COLOURS.bp, 40],
    ['RR', show(r.live ? v.rr : null), COLOURS.rr, 40],
    ['EtCO₂', show(r.live ? v.etco2 : null), COLOURS.co2, 40],
  ];
  let y = 8;
  for (const [label, value, colour, size] of rows) {
    ctx.fillStyle = colour;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(label, TRACE_W + 12, y);
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(value, SCREEN_W - 10, y + 6);
    ctx.textAlign = 'left';
    y += size + 10;
  }
}
