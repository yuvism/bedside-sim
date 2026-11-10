/**
 * A short guide for first-time players, shown on the brief. Open by default
 * until dismissed once (remembered in this browser).
 */
import { useState } from 'react';

const KEY = 'bedside-sim:howto-seen';

function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function HowToPlay() {
  const [open, setOpen] = useState(() => !seen());
  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable */
    }
    setOpen(false);
  };
  return (
    <details className="card howto" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>How to play</summary>
      <ol>
        <li>
          <strong>Start the case.</strong> The clock runs in real time; speed it up with 2×–8× or
          pause when you need to think.
        </li>
        <li>
          <strong>Assess.</strong> <em>Examine</em> works through ABCDE and a body map.{' '}
          <em>Talk</em> lets you ask the patient anything in your own words.
        </li>
        <li>
          <strong>Investigate and treat.</strong> Orders go to the nurse, who reads them back,
          carries them out after a realistic delay, and questions anything unsafe.
        </li>
        <li>
          <strong>Watch the monitor.</strong> Alarms show as text and sound; the patient’s face,
          speech and the log change as they get better or worse.
        </li>
        <li>
          <strong>Commit to a diagnosis</strong>, then end the case for your score, the vitals
          timeline and teaching points. You can replay from any minute.
        </li>
      </ol>
      <p className="muted small">
        Keyboard: <kbd>Space</kbd> pause or resume · <kbd>1</kbd>–<kbd>4</kbd> Talk, Examine,
        Investigate, Treat.
      </p>
      <button type="button" className="btn small" onClick={dismiss}>
        Got it
      </button>
    </details>
  );
}
