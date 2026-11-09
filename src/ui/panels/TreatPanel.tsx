import { useState } from 'react';
import { LIBRARY } from '../../content/library.ts';
import { useSim } from '../../app/store.ts';
import { DrugOrder } from './DrugOrder.tsx';

const VOLUMES = [250, 500, 1000];

export function TreatPanel({ locked }: { locked: boolean }) {
  const act = useSim((s) => s.act);
  const status = useSim((s) => s.view?.status);
  const [volume, setVolume] = useState(500);
  const { devices, procedures } = LIBRARY.devices;
  const on = (id: string) => !!status?.devices.includes(id);
  const running = (id: string) => !!status?.fluidsRunning.some((f) => f.fluidId === id);
  const hasIv = !!(status?.access.iv || status?.access.io);

  return (
    <div className="panel-stack">
      <section className="group" aria-labelledby="treat-team">
        <h3 id="treat-team">Team</h3>
        <div className="grid">
          <button
            className={`act${status?.helpCalled ? ' is-on' : ''}`}
            disabled={locked}
            onClick={() => act({ kind: 'call_help' })}
          >
            Call for help
            <small>Senior and crash team</small>
          </button>
        </div>
      </section>

      <section className="group" aria-labelledby="treat-o2">
        <h3 id="treat-o2">Oxygen and position</h3>
        <div className="grid">
          {devices.map((d) => (
            <button
              key={d.id}
              className={`act${on(d.id) ? ' is-on' : ''}`}
              aria-pressed={on(d.id)}
              disabled={locked}
              onClick={() => act({ kind: 'device', deviceId: d.id, on: !on(d.id) })}
            >
              {d.label}
              <small>{on(d.id) ? 'On · press again to stop' : d.sub}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="group" aria-labelledby="treat-proc">
        <h3 id="treat-proc">Access and procedures</h3>
        <div className="grid">
          {procedures.map((p) => {
            const done = p.grants ? !!status?.access[p.grants] : false;
            return (
              <button
                key={p.id}
                className={`act${done ? ' is-on' : ''}`}
                disabled={locked}
                onClick={() => act({ kind: 'procedure', procedureId: p.id })}
              >
                {p.label}
                {p.sub && <small>{done ? 'In place' : p.sub}</small>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="group" aria-labelledby="treat-fluids">
        <h3 id="treat-fluids">Fluids</h3>
        <div className="fluid-row">
          <label className="field">
            Volume
            <select
              className="input"
              value={volume}
              disabled={locked}
              onChange={(e) => setVolume(Number(e.target.value))}
            >
              {VOLUMES.map((v) => (
                <option key={v} value={v}>
                  {v} ml
                </option>
              ))}
            </select>
          </label>
          {LIBRARY.formulary.fluids.map((f) => (
            <button
              key={f.id}
              className="btn"
              disabled={locked || running(f.id)}
              onClick={() => act({ kind: 'fluid', fluidId: f.id, volumeMl: volume })}
            >
              {running(f.id) ? `${f.name} running…` : `Give ${volume} ml ${f.name.toLowerCase()}`}
            </button>
          ))}
        </div>
        {!hasIv && <p className="hint">Fluids need IV or IO access.</p>}
      </section>

      <section className="group" aria-labelledby="treat-drugs">
        <h3 id="treat-drugs">Drugs</h3>
        <DrugOrder locked={locked} />
      </section>
    </div>
  );
}
