/**
 * Monitor sounds generated with the Web Audio API (no audio files): a pulse
 * beep whose pitch follows SpO2, and alarm tone bursts by priority.
 */
import { spo2ToFrequency, type Priority } from './alarms.ts';

const PREF_KEY = 'bedside-sim:sound';

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export class MonitorAudio {
  private ctx: AudioContext | null = null;
  enabled = readPref();
  /** performance.now() until which alarm sounds are paused. */
  silencedUntil = 0;

  /** Must be called from a user gesture (browsers block audio before one). */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      /* storage unavailable: keep the in-memory setting */
    }
    if (on) this.unlock();
  }

  silence(ms: number, now: number): void {
    this.silencedUntil = now + ms;
  }

  beep(spo2: number | null): void {
    if (spo2 === null) return;
    this.tone(spo2ToFrequency(spo2), 0, 0.07, 0.05);
  }

  alarm(priority: Priority, now: number): void {
    if (now < this.silencedUntil) return;
    if (priority === 'high') {
      // Two bursts of five fast pulses.
      for (const burst of [0, 0.9]) {
        for (let i = 0; i < 5; i++) this.tone(988, burst + i * 0.13, 0.09, 0.08);
      }
    } else {
      for (let i = 0; i < 3; i++) this.tone(659, i * 0.22, 0.14, 0.07);
    }
  }

  private tone(freq: number, at: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.setValueAtTime(vol, t0 + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

export const monitorAudio = new MonitorAudio();
