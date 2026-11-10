import { useMemo } from 'react';
import { useSim } from '../../app/store.ts';
import type { SimEvent } from '../../engine/types.ts';
import { fmtClock } from '../format.ts';
import './log.css';

function display(e: SimEvent): string {
  if (e.type === 'patient') {
    const nonVerbal = e.data?.['nonVerbal'] === true || e.text.startsWith('(');
    return nonVerbal ? `Patient ${e.text}` : `Patient: “${e.text}”`;
  }
  if (e.type === 'nurse') return `Nurse: “${e.text}”`;
  return e.text;
}

export function EventLog() {
  const events = useSim((s) => s.view?.events);
  const list = useMemo(() => [...(events ?? [])].reverse(), [events]);
  return (
    <section className="card logwrap" aria-labelledby="log-h">
      <h2 id="log-h">Event log</h2>
      {list.length === 0 ? (
        <p className="empty">Every question, finding and treatment lands here with a timestamp.</p>
      ) : (
        // Focusable so keyboard users can scroll the log.
        <ol
          className="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-labelledby="log-h"
          tabIndex={0}
        >
          {list.map((e, i) => (
            <li key={list.length - i} className={e.type}>
              <time>{fmtClock(e.t)}</time>
              <span>{display(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
