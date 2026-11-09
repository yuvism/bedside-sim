/**
 * Sweep-style canvas renderer: traces are drawn left to right in real time
 * with an erase bar ahead of the pen, like a bedside monitor.
 */
import type { Rhythm, Signs, Vitals } from '../../engine/types.ts';
import {
  artShape,
  capnoShape,
  ecgBeat,
  fibrillatoryBaseline,
  plethShape,
  vfWave,
} from './shapes.ts';

export const TRACE_COLOURS = {
  ecg: '#3CE07A',
  pleth: '#3FD0F0',
  art: '#FF6B63',
  co2: '#F2D04A',
} as const;

export interface WaveInput {
  vitals: Vitals;
  live: boolean;
  artLine: boolean;
  /** 0–1, bronchospasm severity for the capnogram shape. */
  obstruction: number;
  /** ECG morphology hints from the engine (ecg_st, ecg_peakedT, ecg_wide). */
  signs: Signs;
  cpr: boolean;
}

type Lane = 'ecg' | 'pleth' | 'art' | 'co2';

const PX_PER_SEC = 110;
const STEPS = 8;
const ART_MAX = 200;
const CO2_MAX = 60;

function beatOpts(r: Rhythm, ectopic: boolean, signs: Signs) {
  const wide = (signs['ecg_wide'] ?? 0) > 0.5;
  if (ectopic || wide || r === 'pea' || r === 'vt' || r === 'pvt') return { wide: true };
  const st = r === 'stemi' ? 0.3 : (signs['ecg_st'] ?? 0) * 0.35;
  return { st, peakedT: signs['ecg_peakedT'] ?? 0, noP: r === 'af' || r === 'svt' };
}

export class SweepRenderer {
  private readonly cx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private x = 0;
  private last: Partial<Record<Lane, number>> = {};
  private ecgPhase = 0;
  private respPhase = 0;
  private beat = 0;
  private rrScale = 1;
  private clockSec = 0;
  private readonly onBeat: () => void;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, onBeat: () => void) {
    const cx = canvas.getContext('2d');
    if (!cx) throw new Error('Canvas 2D not available');
    this.canvas = canvas;
    this.cx = cx;
    this.onBeat = onBeat;
    this.resize();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx.fillStyle = '#000';
    this.cx.fillRect(0, 0, this.w, this.h);
    this.x = 0;
    this.last = {};
  }

  private lanes(art: boolean): Lane[] {
    return art ? ['ecg', 'pleth', 'art', 'co2'] : ['ecg', 'pleth', 'co2'];
  }

  /** Advance by dt real seconds. */
  frame(dt: number, input: WaveInput): void {
    const { vitals: v, live } = input;
    const lanes = this.lanes(input.artLine);
    const laneH = this.h / lanes.length;
    const cx = this.cx;
    const rate = live ? (v.hr ?? 0) : 0;
    const perfusing = live && v.sbp !== null;
    const pAmp = perfusing ? Math.max(0.15, Math.min(1, (v.map ?? 0) / 75)) : 0;
    cx.lineWidth = 2;
    cx.lineJoin = 'round';

    for (let i = 0; i < STEPS; i++) {
      const sdt = dt / STEPS;
      this.clockSec += sdt;
      const prev = this.ecgPhase;
      this.ecgPhase += (sdt * rate * this.rrScale) / 60;
      if (Math.floor(this.ecgPhase) > Math.floor(prev)) {
        this.beat++;
        this.rrScale = v.rhythm === 'af' ? 0.7 + Math.random() * 0.6 : 1;
        if (perfusing) this.onBeat();
      }
      const cpr = live && input.cpr;
      this.respPhase += (sdt * (live ? (cpr ? 10 : v.rr) : 0)) / 60;
      const compression = cpr ? Math.max(0, Math.sin(2 * Math.PI * 1.85 * this.clockSec)) : 0;
      const p = this.ecgPhase % 1;
      const ectopic = live && v.ectopy && this.beat % 3 === 2;

      const y: Record<Lane, number> = { ecg: 0, pleth: 0, art: 0, co2: 0 };
      if (!live || v.rhythm === 'asystole') y.ecg = live ? 0.01 * Math.sin(this.clockSec * 3) : 0;
      else if (v.rhythm === 'vf') y.ecg = vfWave(this.clockSec);
      else {
        y.ecg = ecgBeat(p, beatOpts(v.rhythm, ectopic, input.signs));
        if (v.rhythm === 'af') y.ecg += fibrillatoryBaseline(this.clockSec);
      }
      if (cpr) y.ecg += 0.55 * compression - 0.2;
      y.pleth = plethShape(p) * pAmp;
      if (input.artLine && live) {
        const sbp = perfusing ? (v.sbp ?? 0) : 12;
        const dbp = perfusing ? (v.dbp ?? 0) : 10;
        y.art = perfusing
          ? (dbp + (sbp - dbp) * artShape(p)) / ART_MAX
          : (10 + 55 * compression) / ART_MAX;
      }
      y.co2 = live ? (capnoShape(this.respPhase % 1, input.obstruction) * v.etco2) / CO2_MAX : 0;

      const nx = this.x + PX_PER_SEC * sdt;
      cx.fillStyle = '#000';
      cx.fillRect(nx, 0, 18, this.h);
      lanes.forEach((lane, li) => {
        const top = li * laneH;
        const yy =
          lane === 'ecg'
            ? top + laneH * 0.62 - y.ecg * laneH * 0.5
            : top + laneH * 0.9 - y[lane] * laneH * 0.78;
        const prevY = this.last[lane];
        if (prevY !== undefined) {
          cx.strokeStyle = TRACE_COLOURS[lane];
          cx.beginPath();
          cx.moveTo(this.x, prevY);
          cx.lineTo(nx, yy);
          cx.stroke();
        }
        this.last[lane] = yy;
      });
      this.x = nx;
      if (this.x > this.w) {
        this.x = 0;
        this.last = {};
      }
    }
    this.labels(lanes, laneH);
  }

  private labels(lanes: Lane[], laneH: number): void {
    const cx = this.cx;
    const names: Record<Lane, string> = { ecg: 'II', pleth: 'Pleth', art: 'ART', co2: 'CO₂' };
    cx.font = '600 11px "Barlow Condensed", "Arial Narrow", sans-serif';
    lanes.forEach((lane, i) => {
      cx.fillStyle = '#000';
      cx.fillRect(2, i * laneH + 2, 34, 13);
      cx.fillStyle = TRACE_COLOURS[lane];
      cx.fillText(names[lane], 4, i * laneH + 12);
    });
  }
}
