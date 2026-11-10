import type { ValidationResult } from '../../engine/validation/compare.ts';
import { fmtNum, fmtT, VITAL_INFO } from './vitals.ts';

export function MetricsTable({ result }: { result: ValidationResult }) {
  return (
    <div className="table-wrap">
      <table className="metrics">
        <caption className="sr-only">Agreement between simulated and reference vitals</caption>
        <thead>
          <tr>
            <th scope="col">Vital</th>
            <th scope="col">Points</th>
            <th scope="col">RMSE</th>
            <th scope="col">MAE</th>
            <th scope="col">Bias (sim − ref)</th>
            <th scope="col">Max deviation</th>
            <th scope="col">Within tolerance</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {result.vitals.map(({ vital, metrics: m }) => {
            const info = VITAL_INFO[vital];
            return (
              <tr key={vital}>
                <th scope="row">
                  {info.title} <span className="muted">({info.unit})</span>
                </th>
                <td>{m.n}</td>
                <td>{fmtNum(m.rmse)}</td>
                <td>{fmtNum(m.mae)}</td>
                <td>{m.bias === null ? '–' : `${m.bias >= 0 ? '+' : ''}${fmtNum(m.bias)}`}</td>
                <td>{m.maxDev === null ? '–' : `${fmtNum(m.maxDev)} at ${fmtT(m.maxDevT)}`}</td>
                <td>
                  {m.withinTol === null ? '–' : `${Math.round(m.withinTol * 100)}%`}{' '}
                  <span className="muted">(±{m.tolerance})</span>
                </td>
                <td>
                  {m.n === 0 ? (
                    <span className="muted">No data</span>
                  ) : m.flagged ? (
                    <span className="status warn">
                      <span aria-hidden="true">⚠</span> Diverges
                    </span>
                  ) : (
                    <span className="status ok">
                      <span aria-hidden="true">✓</span> Within
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DivergenceList({ result }: { result: ValidationResult }) {
  const items = result.vitals.flatMap((v) => v.divergences.map((d) => ({ v, d })));
  if (!items.length) {
    return <p className="muted">No stretch goes beyond the tolerances you set.</p>;
  }
  return (
    <ul className="divergences">
      {items.map(({ v, d }) => {
        const info = VITAL_INFO[v.vital];
        const when =
          d.from === d.to ? `at ${fmtT(d.from)}` : `from ${fmtT(d.from)} to ${fmtT(d.to)}`;
        return (
          <li key={`${v.vital}-${d.from}`}>
            <span className="status warn">
              <span aria-hidden="true">⚠</span> {info.title}
            </span>{' '}
            sim reads up to {fmtNum(d.peakDev)} {info.unit} {d.simHigher ? 'higher' : 'lower'} than
            the reference {when} (peak at {fmtT(d.peakT)}; tolerance ±{v.metrics.tolerance}).
          </li>
        );
      })}
    </ul>
  );
}

export function EventsTable({ result }: { result: ValidationResult }) {
  return (
    <div className="table-wrap">
      <table className="events">
        <caption className="sr-only">Reference events and how they were replayed</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Event in the reference</th>
            <th scope="col">Replayed as</th>
          </tr>
        </thead>
        <tbody>
          {result.events.map((e, i) => (
            <tr key={`${e.t}-${i}`} className={e.action ? '' : 'not-replayed'}>
              <td>{fmtT(e.t)}</td>
              <td>{e.raw}</td>
              <td>{e.action ? <code>{e.code}</code> : <span className="muted">{e.note}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
