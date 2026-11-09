/** Start, titrate or stop a continuous infusion for one drug. */
import { useId, useState } from 'react';
import { useSim } from '../../app/store.ts';
import type { DrugDef } from '../../engine/types.ts';

export function InfusionControl({ drug, locked }: { drug: DrugDef; locked: boolean }) {
  const inf = drug.infusion;
  const act = useSim((s) => s.act);
  const running = useSim(
    (s) => s.view?.status.infusions.find((i) => i.drugId === drug.id)?.rate ?? 0,
  );
  const access = useSim((s) => !!(s.view?.status.access.iv || s.view?.status.access.io));
  const [rate, setRate] = useState(String(inf?.standardRate ?? ''));
  const uid = useId();
  if (!inf) return null;
  const n = Number(rate);
  return (
    <div className="infusion">
      <p className="hint">
        {running > 0
          ? `Running at ${running} ${inf.unit}.`
          : `Usual range ${inf.minRate}–${inf.maxRate} ${inf.unit}.`}
      </p>
      <div className="dose-row">
        <label className="field" htmlFor={`${uid}-rate`}>
          Rate ({inf.unit})
        </label>
        <input
          id={`${uid}-rate`}
          className="input dose"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={locked}
        />
        <button className="btn" disabled={locked} onClick={() => setRate(String(inf.standardRate))}>
          Standard rate ({inf.standardRate} {inf.unit})
        </button>
      </div>
      {!access && <p className="hint warn">Needs IV or IO access first.</p>}
      <div className="row-inline">
        <button
          className="btn primary"
          disabled={locked || !(n > 0)}
          onClick={() => act({ kind: 'infusion', drugId: drug.id, rate: n })}
        >
          {running > 0
            ? `Change ${drug.name.toLowerCase()} rate`
            : `Start ${drug.name.toLowerCase()} infusion`}
        </button>
        {running > 0 && (
          <button
            className="btn"
            disabled={locked}
            onClick={() => act({ kind: 'infusion', drugId: drug.id, rate: 0 })}
          >
            Stop infusion
          </button>
        )}
      </div>
    </div>
  );
}
