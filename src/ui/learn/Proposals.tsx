/** Step 3 of "Learn from a video": review the fitted values and additions. */
import type { FitResult } from '../../engine/learning/fit.ts';
import type { Addition } from '../../engine/learning/propose.ts';
import { REF_VITALS } from '../../engine/validation/csv.ts';
import { fmtNum, VITAL_INFO } from '../validation/vitals.ts';

interface Props {
  fit: FitResult;
  additions: Addition[];
  changeOn: Set<string>;
  addOn: Set<string>;
  onToggleChange(id: string): void;
  onToggleAdd(id: string): void;
}

const KIND_LABEL: Record<Addition['kind'], string> = {
  scoring: 'Scoring rule',
  hint: 'Guided-mode prompt',
  patientLine: 'Patient line',
  investigation: 'Test result',
  library: 'Library change needed',
};

function describe(a: Addition): string {
  switch (a.kind) {
    case 'scoring':
      return `${a.rule.label} (+${a.rule.weight})`;
    case 'hint':
      return `“${a.hint.text}”`;
    case 'patientLine':
      return `“${a.line.text}”`;
    case 'investigation':
      return `${a.investigation.id}: ${a.investigation.results[0]?.text ?? ''}`;
    case 'library':
      return a.text;
  }
}

export function Proposals({ fit, additions, changeOn, addOn, onToggleChange, onToggleAdd }: Props) {
  const library = additions.filter((a) => a.kind === 'library');
  const caseAdds = additions.filter((a) => a.kind !== 'library');
  return (
    <div className="proposals">
      <h4>How well the case follows the video</h4>
      <div className="table-wrap">
        <table className="fit-table">
          <thead>
            <tr>
              <th scope="col">Vital</th>
              <th scope="col">Error before</th>
              <th scope="col">Error after</th>
            </tr>
          </thead>
          <tbody>
            {REF_VITALS.filter((v) => fit.rmseBefore[v] !== undefined).map((v) => (
              <tr key={v}>
                <th scope="row">
                  {VITAL_INFO[v].title} <span className="muted">({VITAL_INFO[v].unit})</span>
                </th>
                <td>{fmtNum(fit.rmseBefore[v])}</td>
                <td>
                  <strong>{fmtNum(fit.rmseAfter[v])}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Root-mean-square difference from the video, in each vital’s units. Overall{' '}
        {fmtNum(fit.scoreBefore, 2)} → {fmtNum(fit.scoreAfter, 2)} (squared tolerances) after{' '}
        {fit.evals} engine runs.
      </p>

      <h4>Update: fitted values ({fit.changes.length})</h4>
      {fit.changes.length === 0 && (
        <p className="muted">
          The case already fits the video as well as its tunable values allow.
        </p>
      )}
      <ul className="check-list">
        {fit.changes.map((c) => (
          <li key={c.tunable.id}>
            <label>
              <input
                type="checkbox"
                checked={changeOn.has(c.tunable.id)}
                onChange={() => onToggleChange(c.tunable.id)}
              />
              <span>
                {c.tunable.label}: <s>{fmtNum(c.before, 3)}</s> →{' '}
                <strong>{fmtNum(c.after, 3)}</strong>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <h4>Add what’s missing ({caseAdds.length})</h4>
      {caseAdds.length === 0 && (
        <p className="muted">Nothing missing in the case for this video.</p>
      )}
      <ul className="check-list">
        {caseAdds.map((a) => (
          <li key={a.id}>
            <label>
              <input type="checkbox" checked={addOn.has(a.id)} onChange={() => onToggleAdd(a.id)} />
              <span>
                <span className="tag">{KIND_LABEL[a.kind]}</span> {describe(a)}
                <span className="muted small"> {a.because}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {library.length > 0 && (
        <>
          <h4>Needs a library change ({library.length})</h4>
          <p className="muted small">
            These aren’t in the shared formulary or device list yet, so they can’t be added to a
            case automatically. Add them to <code>src/content/</code> with a source (see
            CONTRIBUTING.md), then analyse again.
          </p>
          <ul className="lib-list">
            {library.map((a) => (
              <li key={a.id}>
                <span className="status warn">
                  <span aria-hidden="true">⚠</span> {a.text}
                </span>{' '}
                <span className="muted small">{a.because}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
