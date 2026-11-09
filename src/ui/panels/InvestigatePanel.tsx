import { LIBRARY } from '../../content/library.ts';
import { useSim } from '../../app/store.ts';
import type { InvestigationDef } from '../../engine/types.ts';
import { fmtClock, fmtDuration } from '../format.ts';

const CATEGORIES: { id: InvestigationDef['category']; label: string }[] = [
  { id: 'bedside', label: 'Bedside' },
  { id: 'lab', label: 'Laboratory' },
  { id: 'imaging', label: 'Imaging' },
];

export function InvestigatePanel({ locked }: { locked: boolean }) {
  const view = useSim((s) => s.view);
  const act = useSim((s) => s.act);
  const markRead = useSim((s) => s.markRead);
  const t = view?.t ?? 0;
  const pending = new Map((view?.status.pendingOrders ?? []).map((o) => [o.investigationId, o]));
  const results = view?.results ?? [];
  const unread = view?.unread ?? 0;

  return (
    <div className="panel-stack">
      {CATEGORIES.map((cat) => {
        const items = LIBRARY.investigations.investigations.filter((i) => i.category === cat.id);
        if (!items.length) return null;
        return (
          <section key={cat.id} className="group" aria-labelledby={`inv-${cat.id}`}>
            <h3 id={`inv-${cat.id}`}>{cat.label}</h3>
            <div className="grid">
              {items.map((inv) => {
                const p = pending.get(inv.id);
                return (
                  <button
                    key={inv.id}
                    className={`act${p ? ' is-on' : ''}`}
                    disabled={locked || !!p}
                    onClick={() => act({ kind: 'order', investigationId: inv.id })}
                  >
                    {inv.label}
                    <small>
                      {p
                        ? `Due in ${fmtClock(p.dueT - t)}`
                        : `Result ${fmtDuration(inv.turnaroundMin)}`}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <section className="group" aria-labelledby="inv-results">
        <div className="group-head">
          <h3 id="inv-results">
            Results{unread > 0 && <span className="badge">{unread} new</span>}
          </h3>
          {unread > 0 && (
            <button className="btn small" onClick={() => markRead()}>
              Mark all read
            </button>
          )}
        </div>
        {results.length === 0 ? (
          <p className="hint">Nothing back yet. Bedside tests report straight away.</p>
        ) : (
          <ol className="results">
            {results.map((r) => (
              <li key={`${r.investigationId}-${r.t}`} className={r.read ? '' : 'unread'}>
                <button
                  className="result"
                  onClick={() => markRead(r.investigationId)}
                  aria-label={`${r.read ? '' : 'Unread. '}${r.label} at ${fmtClock(r.t)}: ${r.text}`}
                >
                  <span className="result-head">
                    <strong>{r.label}</strong>
                    <time>{fmtClock(r.t)}</time>
                  </span>
                  <span>{r.text}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
