/**
 * What the nurse is doing: questions about unsafe orders (answer them) and
 * tasks in progress with time remaining.
 */
import { useSim } from '../../app/store.ts';
import { fmtClock } from '../format.ts';

/** A stable empty list, so the store selector doesn't return a new array each time. */
const NONE: never[] = [];

export function NursePanel() {
  const tasks = useSim((s) => s.view?.tasks ?? NONE);
  const queries = useSim((s) => s.view?.queries ?? NONE);
  const t = useSim((s) => s.view?.t ?? 0);
  const answer = useSim((s) => s.answer);
  const phase = useSim((s) => s.phase);
  if (!tasks.length && !queries.length) return null;
  const locked = phase !== 'running';

  return (
    <section className="card nurse" aria-labelledby="nurse-h">
      <h2 id="nurse-h">Nurse</h2>
      {queries.map((q) => (
        <div key={q.id} className="query" role="alert">
          <p>
            <strong>Nurse:</strong> “{q.question}”
          </p>
          <div className="row-inline">
            <button className="btn" disabled={locked} onClick={() => answer(q.id, false)}>
              {q.kind === 'access' ? 'No, leave it' : 'Cancel the order'}
            </button>
            <button
              className={`btn ${q.kind === 'access' ? 'primary' : 'danger'}`}
              disabled={locked}
              onClick={() => answer(q.id, true)}
            >
              {q.kind === 'access' ? 'Yes, cannula first' : 'Give it anyway'}
            </button>
          </div>
        </div>
      ))}
      {tasks.length > 0 && (
        <ul className="tasks" aria-label="Tasks in progress">
          {tasks.map((task) => (
            <li key={task.id}>
              <span>{task.label}</span>
              <time aria-label={`ready in ${fmtClock(Math.max(0, task.dueT - t))}`}>
                {fmtClock(Math.max(0, task.dueT - t))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
