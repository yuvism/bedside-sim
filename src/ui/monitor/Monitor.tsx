import { useEffect, useRef, useState } from 'react';
import { LIBRARY } from '../../content/library.ts';
import { useSim } from '../../app/store.ts';
import type { Rhythm } from '../../engine/types.ts';
import { fmtClock, fmtInt } from '../format.ts';
import { evaluateAlarms, topPriority, type ActiveAlarm, type AlarmKey } from './alarms.ts';
import { monitorAudio } from './audio.ts';
import { SweepRenderer } from './sweep.ts';
import { setTraceCanvas } from './traceSource.ts';
import './monitor.css';

const RHYTHM_SHORT: Record<Rhythm, string> = {
  sinus: 'sinus',
  sinus_tachy: 'sinus tachy',
  sinus_brady: 'sinus brady',
  af: 'AF',
  svt: 'SVT',
  vt: 'VT',
  pvt: 'VT',
  vf: 'VF',
  pea: 'check pulse',
  asystole: 'asystole',
  stemi: 'ST ↑',
};

const SILENCE_MS = 120_000;

interface NumProps {
  label: string;
  sub?: string;
  value: string;
  unit?: string;
  extra?: string;
  colour: string;
  alarm?: 'high' | 'medium' | null;
  big?: boolean;
}

function Num({ label, sub, value, unit, extra, colour, alarm, big }: NumProps) {
  const cls = `num${alarm ? ` alarm-${alarm}` : ''}${big ? ' big' : ''}`;
  return (
    <div className={cls} style={{ color: colour }}>
      <div className="num-l">
        <span>{label}</span>
        {sub && <span>{sub}</span>}
      </div>
      <div className="num-v" aria-label={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
        {value}
        {unit && <small>{unit}</small>}
        {extra && <small>{extra}</small>}
      </div>
    </div>
  );
}

function o2Label(devices: string[]): string {
  for (const id of devices) {
    const d = LIBRARY.devices.devices.find((x) => x.id === id);
    if (d?.category === 'oxygen') return d.short ?? d.label;
  }
  return 'air';
}

const alarmFor = (alarms: ActiveAlarm[], ...keys: AlarmKey[]) =>
  alarms.find((a) => keys.includes(a.key))?.priority ?? null;

export function Monitor() {
  const view = useSim((s) => s.view);
  const phase = useSim((s) => s.phase);
  const cycleNibp = useSim((s) => s.cycleNibp);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [soundOn, setSoundOn] = useState(monitorAudio.enabled);
  const [silenced, setSilenced] = useState(false);

  useEffect(() => {
    if (!silenced) return;
    const id = setTimeout(() => setSilenced(false), SILENCE_MS);
    return () => clearTimeout(id);
  }, [silenced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new SweepRenderer(canvas, () => {
      monitorAudio.beep(useSim.getState().view?.vitals.spo2 ?? null);
    });
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const st = useSim.getState();
      if (st.view && !st.paused && st.phase !== 'ended') {
        r.frame(dt, {
          vitals: st.view.vitals,
          live: st.phase === 'running',
          artLine: st.view.status.access.art,
          obstruction: Math.min(1, (st.view.signs['wheeze'] ?? 0) * 0.9),
          signs: st.view.signs,
          cpr: st.view.status.cpr,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => r.resize();
    window.addEventListener('resize', onResize);
    setTraceCanvas(canvas);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      setTraceCanvas(null);
    };
  }, []);

  // Alarm tones: high priority every 5 s, medium every 12 s (real time).
  useEffect(() => {
    let lastHigh = -Infinity;
    let lastMed = -Infinity;
    const id = setInterval(() => {
      const st = useSim.getState();
      if (!st.view || st.phase !== 'running' || st.paused) return;
      const top = topPriority(
        evaluateAlarms({
          vitals: st.view.vitals,
          nibp: st.view.nibp,
          artLine: st.view.status.access.art,
        }),
      );
      const now = performance.now();
      if (top === 'high' && now - lastHigh > 5000) {
        lastHigh = now;
        monitorAudio.alarm('high', now);
      } else if (top === 'medium' && now - lastMed > 12000) {
        lastMed = now;
        monitorAudio.alarm('medium', now);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const live = phase !== 'brief' && !!view;
  const v = view?.vitals;
  const art = !!view?.status.access.art;
  const alarms = live && v ? evaluateAlarms({ vitals: v, nibp: view.nibp, artLine: art }) : [];
  const nibp = view?.nibp;
  const announce = alarms.map((a) => a.message.replace(/\s\d+(\.\d+)?/, '')).join(', ');

  const toggleSound = () => {
    monitorAudio.setEnabled(!soundOn);
    setSoundOn(!soundOn);
  };
  const toggleSilence = () => {
    if (silenced) {
      monitorAudio.silencedUntil = 0;
      setSilenced(false);
    } else {
      monitorAudio.silence(SILENCE_MS, performance.now());
      setSilenced(true);
    }
  };

  return (
    <section id="monitor" className="monitor-wrap" aria-label="Patient monitor">
      <div className="monitor">
        <div className="alarm-strip" aria-hidden="true">
          {alarms.slice(0, 3).map((a) => (
            <span key={a.key} className={`alarm-msg ${a.priority}`}>
              {a.message}
            </span>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {announce ? `Monitor alarm: ${announce}` : ''}
        </p>
        <canvas ref={canvasRef} className="trace" aria-hidden="true" />
        <div className="nums">
          <Num
            label="HR"
            sub={live && v ? RHYTHM_SHORT[v.rhythm] : ''}
            value={live ? (v?.rhythm === 'vf' ? '???' : fmtInt(v?.hr)) : '--'}
            colour="var(--hr)"
            alarm={alarmFor(alarms, 'hr', 'rhythm')}
            big
          />
          <Num
            label="SpO₂"
            sub={view ? o2Label(view.status.devices) : 'air'}
            value={live ? fmtInt(v?.spo2) : '--'}
            unit="%"
            colour="var(--spo2)"
            alarm={alarmFor(alarms, 'spo2')}
            big
          />
          {art ? (
            <Num
              label="ART"
              sub="mmHg"
              value={live && v?.sbp != null ? `${fmtInt(v.sbp)}/${fmtInt(v.dbp)}` : '--/--'}
              extra={live && v?.map != null ? `(${fmtInt(v.map)})` : ''}
              colour="var(--bp)"
              alarm={alarmFor(alarms, 'bp')}
            />
          ) : null}
          <Num
            label="NIBP"
            sub={nibp ? `at ${fmtClock(nibp.t)}` : live ? 'no reading' : ''}
            value={live && nibp ? `${nibp.sbp}/${nibp.dbp}` : '--/--'}
            extra={live && nibp ? `(${nibp.map})` : ''}
            colour="var(--bp)"
            alarm={art ? null : alarmFor(alarms, 'bp')}
          />
          <Num
            label="RR"
            sub="/min"
            value={live ? fmtInt(v?.rr) : '--'}
            colour="var(--rr)"
            alarm={alarmFor(alarms, 'rr')}
          />
          <Num
            label="EtCO₂"
            sub="mmHg"
            value={live ? fmtInt(v?.etco2) : '--'}
            colour="var(--rr)"
            alarm={alarmFor(alarms, 'etco2')}
          />
          <Num
            label="Temp"
            sub="°C"
            value={live && v ? v.temp.toFixed(1) : '--'}
            colour="#D9E2E0"
            alarm={alarmFor(alarms, 'temp')}
          />
        </div>
      </div>
      <div className="monitor-controls">
        <button className="btn" onClick={cycleNibp} disabled={phase !== 'running'}>
          Take NIBP now
        </button>
        <button
          className="btn"
          aria-pressed={silenced}
          onClick={toggleSilence}
          disabled={phase !== 'running'}
        >
          {silenced ? 'Alarms silenced' : 'Silence alarms 2 min'}
        </button>
        <button className="btn" aria-pressed={!soundOn} onClick={toggleSound}>
          {soundOn ? 'Mute sound' : 'Sound off'}
        </button>
      </div>
    </section>
  );
}
