/**
 * Searchable formulary with route and dose pickers. "Standard dose" fills in
 * the formulary dose for the chosen route; the give button names the drug.
 */
import { useId, useMemo, useState } from 'react';
import { LIBRARY } from '../../content/library.ts';
import { useSim } from '../../app/store.ts';
import type { DrugDef, Route } from '../../engine/types.ts';
import { InfusionControl } from './InfusionControl.tsx';

const ROUTE_NAMES: Record<Route, string> = {
  IM: 'IM',
  IV: 'IV',
  IO: 'IO',
  NEB: 'Nebulised',
  INH: 'Inhaled',
  PO: 'Oral',
  SC: 'Subcut',
  IN: 'Intranasal',
  SL: 'Sublingual',
};

function matches(d: DrugDef, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return [d.name, d.drugClass, ...(d.aliases ?? [])].some((x) => x.toLowerCase().includes(s));
}

export function DrugOrder({ locked }: { locked: boolean }) {
  const act = useSim((s) => s.act);
  const access = useSim((s) => s.view?.status.access);
  const [query, setQuery] = useState('');
  const [drugId, setDrugId] = useState<string | null>(null);
  const [route, setRoute] = useState<Route | 'INF' | null>(null);
  const [dose, setDose] = useState('');
  const uid = useId();
  const list = useMemo(() => LIBRARY.formulary.drugs.filter((d) => matches(d, query)), [query]);
  const drug = LIBRARY.formulary.drugs.find((d) => d.id === drugId) ?? null;
  const routeDef = drug?.routes.find((r) => r.route === route) ?? null;

  const pick = (d: DrugDef) => {
    setDrugId(d.id);
    const first = d.routes[0];
    setRoute(d.infusion && d.drugClass === 'Vasopressor' ? 'INF' : (first?.route ?? null));
    setDose(first ? String(first.standardDose) : '');
  };
  const pickRoute = (r: Route | 'INF') => {
    setRoute(r);
    const def = drug?.routes.find((x) => x.route === r);
    if (def) setDose(String(def.standardDose));
  };
  const doseNum = Number(dose);
  const needsAccess = route === 'IV' || route === 'IO';
  const hasAccess = route === 'IO' ? access?.io : access?.iv || access?.io;
  const give = () => {
    if (!drug || !route || route === 'INF' || !(doseNum > 0)) return;
    act({ kind: 'drug', drugId: drug.id, route, dose: doseNum });
  };

  return (
    <div className="drug-order">
      <label className="field" htmlFor={`${uid}-q`}>
        Search drugs
      </label>
      <input
        id={`${uid}-q`}
        type="search"
        className="input"
        placeholder="Name or class, e.g. adrenaline"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={locked}
      />
      <ul className="drug-list" aria-label="Formulary">
        {list.map((d) => (
          <li key={d.id}>
            <button
              className={`act${d.id === drugId ? ' is-on' : ''}`}
              aria-pressed={d.id === drugId}
              disabled={locked}
              onClick={() => pick(d)}
            >
              {d.name}
              <small>{d.drugClass}</small>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="hint">No drug matches “{query}”.</li>}
      </ul>

      {drug && (
        <div className="dose-box" aria-label={`Prescribe ${drug.name}`} role="group">
          <fieldset className="routes">
            <legend>Route</legend>
            {drug.routes.map((r) => (
              <label key={r.route} className="radio">
                <input
                  type="radio"
                  name={`${uid}-route`}
                  value={r.route}
                  checked={route === r.route}
                  onChange={() => pickRoute(r.route)}
                  disabled={locked}
                />
                {ROUTE_NAMES[r.route]}
                <small>{r.label}</small>
              </label>
            ))}
            {drug.infusion && (
              <label className="radio">
                <input
                  type="radio"
                  name={`${uid}-route`}
                  value="INF"
                  checked={route === 'INF'}
                  onChange={() => pickRoute('INF')}
                  disabled={locked}
                />
                Infusion
                <small>Continuous, {drug.infusion.unit}</small>
              </label>
            )}
          </fieldset>
          {route === 'INF' ? (
            <InfusionControl drug={drug} locked={locked} />
          ) : (
            <>
              <div className="dose-row">
                <label className="field" htmlFor={`${uid}-dose`}>
                  Dose ({drug.unit})
                </label>
                <input
                  id={`${uid}-dose`}
                  className="input dose"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={dose}
                  onChange={(e) => setDose(e.target.value)}
                  disabled={locked}
                />
                {routeDef && (
                  <button
                    className="btn"
                    disabled={locked}
                    onClick={() => setDose(String(routeDef.standardDose))}
                  >
                    Standard dose ({routeDef.standardDose} {drug.unit})
                  </button>
                )}
              </div>
              {needsAccess && !hasAccess && (
                <p className="hint warn">Needs IV or IO access first.</p>
              )}
              <button
                className="btn primary"
                disabled={locked || !route || !(doseNum > 0)}
                onClick={give}
              >
                Give {drug.name.toLowerCase()}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
