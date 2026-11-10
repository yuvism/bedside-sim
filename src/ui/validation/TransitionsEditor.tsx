/** Key transitions: from an action to a vital crossing a threshold, video vs sim. */
import type { TransitionResult, TransitionSpec } from '../../engine/validation/compare.ts';
import { REF_VITALS, type RefVital } from '../../engine/validation/csv.ts';
import { fmtLag, fmtNum, VITAL_INFO } from './vitals.ts';

interface Props {
  specs: TransitionSpec[];
  results: TransitionResult[];
  /** Trigger choices: action-code prefixes seen in the reference. */
  triggers: string[];
  onChange(next: TransitionSpec[]): void;
}

let counter = 0;
const nextId = () => `tr-${Date.now().toString(36)}-${(counter += 1)}`;

export function TransitionsEditor({ specs, results, triggers, onChange }: Props) {
  const patch = (i: number, p: Partial<TransitionSpec>) =>
    onChange(specs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const add = () =>
    onChange([
      ...specs,
      { id: nextId(), trigger: triggers[0] ?? '', vital: 'sbp', direction: 'above', threshold: 90 },
    ]);
  return (
    <div className="transitions">
      {specs.length === 0 && (
        <p className="muted">
          Add a transition to measure, for example the time from adrenaline to SBP above 90.
        </p>
      )}
      {specs.map((s, i) => {
        const r = results.find((x) => x.id === s.id);
        return (
          <div key={s.id} className="transition card">
            <div className="tr-def" role="group" aria-label={`Transition ${i + 1}`}>
              <label>
                From
                <select
                  className="input"
                  value={s.trigger}
                  onChange={(e) => patch(i, { trigger: e.target.value })}
                >
                  {!triggers.includes(s.trigger) && (
                    <option value={s.trigger}>{s.trigger || '—'}</option>
                  )}
                  {triggers.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                to
                <select
                  className="input"
                  value={s.vital}
                  onChange={(e) => patch(i, { vital: e.target.value as RefVital })}
                >
                  {REF_VITALS.map((v) => (
                    <option key={v} value={v}>
                      {VITAL_INFO[v].title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Direction</span>
                <select
                  className="input"
                  value={s.direction}
                  onChange={(e) => patch(i, { direction: e.target.value as 'above' | 'below' })}
                >
                  <option value="above">above</option>
                  <option value="below">below</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Threshold</span>
                <input
                  className="input num"
                  type="number"
                  step="any"
                  value={s.threshold}
                  onChange={(e) => patch(i, { threshold: Number(e.target.value) })}
                />
              </label>
              <button
                type="button"
                className="link-btn danger"
                onClick={() => onChange(specs.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
            {r && (
              <p className="tr-result">
                {r.triggerT === null ? (
                  <span className="muted">That action isn’t in the reference.</span>
                ) : (
                  <>
                    Video:{' '}
                    <strong>{r.refDelay === null ? 'never' : `${fmtNum(r.refDelay, 0)} s`}</strong>{' '}
                    · Sim:{' '}
                    <strong>{r.simDelay === null ? 'never' : `${fmtNum(r.simDelay, 0)} s`}</strong>{' '}
                    · Lag: <strong>{fmtLag(r.lagSec)}</strong>
                    {r.lagSec !== null && (
                      <span className="muted">
                        {' '}
                        (
                        {r.lagSec > 0
                          ? 'sim responds later'
                          : r.lagSec < 0
                            ? 'sim responds sooner'
                            : 'same time'}
                        )
                      </span>
                    )}
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
      <button type="button" className="btn small" onClick={add} disabled={!triggers.length}>
        + Add transition
      </button>
    </div>
  );
}
