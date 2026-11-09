/**
 * Cardiac arrest controls, shown above the action tabs while the patient is
 * in arrest: CPR, defibrillation, rhythm/pulse checks and the ALS drugs.
 */
import { useState } from 'react';
import { useSim } from '../../app/store.ts';
import { fmtClock } from '../format.ts';

const ENERGIES = [150, 200, 360];

export function AlsPanel() {
  const status = useSim((s) => s.view?.status);
  const t = useSim((s) => s.view?.t ?? 0);
  const rhythm = useSim((s) => s.view?.vitals.rhythm);
  const act = useSim((s) => s.act);
  const phase = useSim((s) => s.phase);
  const [joules, setJoules] = useState(150);
  if (!status?.arrest || !status.als) return null;
  const als = status.als;
  const locked = phase !== 'running';
  const pads = status.devices.includes('defib_pads');
  const access = status.access.iv || status.access.io;
  const route = status.access.iv ? 'IV' : 'IO';
  const sinceCheck = Math.round(als.cprSinceCheck);
  const cprFraction = Math.round((100 * als.cprSec) / Math.max(1, t - als.t0));

  return (
    <section className="card als" aria-labelledby="als-h" role="region">
      <div className="als-head">
        <h2 id="als-h">Cardiac arrest</h2>
        <p>
          Down time {fmtClock(t - als.t0)} · CPR {cprFraction}% · shocks {als.shocks}
          {status.cpr && <> · cycle {fmtClock(sinceCheck)}</>}
        </p>
      </div>
      <div className="als-grid">
        <button
          className={`btn ${status.cpr ? '' : 'primary'}`}
          disabled={locked}
          onClick={() => act({ kind: 'cpr', on: !status.cpr })}
        >
          {status.cpr ? 'Pause CPR' : 'Start CPR'}
        </button>
        {!pads && (
          <button
            className="btn"
            disabled={locked}
            onClick={() => act({ kind: 'device', deviceId: 'defib_pads', on: true })}
          >
            Attach pads
          </button>
        )}
        <div className="als-shock">
          <label>
            <span className="sr-only">Energy</span>
            <select
              value={joules}
              onChange={(e) => setJoules(Number(e.target.value))}
              disabled={locked}
            >
              {ENERGIES.map((j) => (
                <option key={j} value={j}>
                  {j} J
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn danger"
            disabled={locked || !pads}
            onClick={() => act({ kind: 'shock', joules })}
          >
            Shock
          </button>
        </div>
        <button className="btn" disabled={locked} onClick={() => act({ kind: 'pulse_check' })}>
          Rhythm and pulse check
        </button>
        <button
          className="btn"
          disabled={locked || !access}
          onClick={() => act({ kind: 'drug', drugId: 'adrenaline', route, dose: 1 })}
        >
          Adrenaline 1 mg {route}
        </button>
        <button
          className="btn"
          disabled={locked || !access}
          onClick={() => act({ kind: 'drug', drugId: 'amiodarone', route, dose: 300 })}
        >
          Amiodarone 300 mg {route}
        </button>
        {!access && (
          <button
            className="btn"
            disabled={locked}
            onClick={() => act({ kind: 'procedure', procedureId: 'io_access' })}
          >
            IO access
          </button>
        )}
      </div>
      <p className="hint">
        Monitor shows {rhythm === 'vf' || rhythm === 'pvt' ? 'a shockable' : 'a non-shockable'}{' '}
        rhythm. Check the rhythm every 2 minutes and think about reversible causes (4 Hs and 4 Ts).
      </p>
    </section>
  );
}
