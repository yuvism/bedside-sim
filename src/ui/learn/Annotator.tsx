/**
 * Step 2 of "Learn from a video": play the video next to a form and record
 * what the monitor shows and what the team does, row by row.
 */
import { useRef, useState } from 'react';
import { aiReady, type AiSettings } from '../../app/aiSettings.ts';
import { readMonitorFrame } from '../../app/claudeVision.ts';
import { REF_VITALS, type RefVital } from '../../engine/validation/csv.ts';
import { fmtT, VITAL_INFO } from '../validation/vitals.ts';
import { emptyValues, type Row } from './rows.ts';

interface Props {
  rows: Row[];
  onRows(rows: Row[]): void;
  videoUrl: string | null;
  ai: AiSettings;
  /** Action codes offered while typing an event. */
  codes: string[];
}

const num = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function Annotator({ rows, onRows, videoUrl, ai, codes }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState(0);
  const [t, setT] = useState('0');
  const [vals, setVals] = useState<Record<RefVital, string>>(
    Object.fromEntries(REF_VITALS.map((v) => [v, ''])) as Record<RefVital, string>,
  );
  const [event, setEvent] = useState('');
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const now = () => Math.max(0, Math.round((videoRef.current?.currentTime ?? 0) - start));

  const add = () => {
    const values = emptyValues();
    for (const v of REF_VITALS) values[v] = num(vals[v]);
    const tt = num(t);
    if (tt === null || tt < 0) return;
    onRows([...rows, { t: tt, values, event: event.trim() }].sort((a, b) => a.t - b.t));
    setVals(Object.fromEntries(REF_VITALS.map((v) => [v, ''])) as Record<RefVital, string>);
    setEvent('');
  };

  const readFrame = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    const jpeg = c.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '';
    setReading(true);
    setT(String(now()));
    const r = await readMonitorFrame(ai, jpeg);
    setReading(false);
    if (!r.ok) {
      setAiNote(r.notice);
      return;
    }
    setVals((old) => {
      const next = { ...old };
      for (const k of REF_VITALS) {
        const x = r.reading[k];
        if (x !== null) next[k] = String(x);
      }
      return next;
    });
    setAiNote(`Claude read the frame. Check every number before adding it. ${r.reading.notes}`);
  };

  return (
    <div className="annotator">
      {videoUrl && (
        <div className="anno-video">
          <video ref={videoRef} src={videoUrl} controls preload="metadata" />
          <div className="anno-row">
            <button
              type="button"
              className="btn small"
              onClick={() => setStart(videoRef.current?.currentTime ?? 0)}
            >
              Scenario starts now
            </button>
            <span className="muted small">Scenario time 0 = video {fmtT(start)}</span>
          </div>
        </div>
      )}
      <fieldset className="anno-form">
        <legend>Add a reading</legend>
        <div className="anno-fields">
          <label>
            Time (s)
            <span className="anno-time">
              <input
                className="input num"
                type="number"
                min={0}
                value={t}
                onChange={(e) => setT(e.target.value)}
              />
              {videoUrl && (
                <button type="button" className="btn small" onClick={() => setT(String(now()))}>
                  Now
                </button>
              )}
            </span>
          </label>
          {REF_VITALS.map((v) => (
            <label key={v}>
              {VITAL_INFO[v].title}
              <input
                className="input num"
                type="number"
                value={vals[v]}
                placeholder="—"
                onChange={(e) => setVals({ ...vals, [v]: e.target.value })}
              />
            </label>
          ))}
          <label className="anno-event">
            Event (action id or what happened)
            <input
              className="input"
              list="learn-codes"
              value={event}
              placeholder="drug:adrenaline:IM, procedure:front_of_neck_access, or a note"
              onChange={(e) => setEvent(e.target.value)}
            />
          </label>
        </div>
        <datalist id="learn-codes">
          {codes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="anno-row">
          <button type="button" className="btn primary" onClick={add}>
            Add reading
          </button>
          {videoUrl && aiReady(ai) && (
            <button
              type="button"
              className="btn"
              onClick={() => void readFrame()}
              disabled={reading}
            >
              {reading ? 'Reading…' : 'Read monitor with Claude'}
            </button>
          )}
        </div>
        {aiNote && (
          <p className="hint" role="status">
            {aiNote}
          </p>
        )}
      </fieldset>

      <div className="table-wrap">
        <table className="anno-table">
          <caption className="sr-only">Annotated timeline</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              {REF_VITALS.map((v) => (
                <th key={v} scope="col">
                  {VITAL_INFO[v].title}
                </th>
              ))}
              <th scope="col">Event</th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.t}-${i}`}>
                <td>{fmtT(r.t)}</td>
                {REF_VITALS.map((v) => (
                  <td key={v}>{r.values[v] ?? ''}</td>
                ))}
                <td className="anno-ev">{r.event}</td>
                <td>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => onRows(rows.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted">No readings yet.</p>}
    </div>
  );
}
