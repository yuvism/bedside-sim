import { useMemo } from 'react';
import { useSim } from '../../app/store.ts';
import type { TalkCategory } from '../../engine/caseTypes.ts';
import { useDoneCodes } from './useDoneCodes.ts';

const CATEGORY_LABELS: Record<TalkCategory, string> = {
  presenting: 'Presenting complaint',
  history: 'History of the complaint',
  pmh: 'Past medical history',
  meds: 'Medicines',
  allergies: 'Allergies',
  social: 'Social history',
  family: 'Family history',
  ice: 'Ideas, concerns, expectations',
};

export function TalkPanel({ locked }: { locked: boolean }) {
  const session = useSim((s) => s.session);
  const act = useSim((s) => s.act);
  const done = useDoneCodes();
  const groups = useMemo(() => {
    const out = new Map<TalkCategory, { id: string; q: string }[]>();
    for (const d of session?.caseDef.dialogue ?? []) {
      const list = out.get(d.category) ?? [];
      list.push({ id: d.id, q: d.q });
      out.set(d.category, list);
    }
    return [...out.entries()];
  }, [session]);

  return (
    <div className="panel-stack">
      {groups.map(([cat, qs]) => (
        <section key={cat} className="group" aria-labelledby={`talk-${cat}`}>
          <h3 id={`talk-${cat}`}>{CATEGORY_LABELS[cat]}</h3>
          <div className="grid">
            {qs.map((q) => (
              <button
                key={q.id}
                className={`act${done.has(`talk:${q.id}`) ? ' is-done' : ''}`}
                disabled={locked}
                onClick={() => act({ kind: 'talk', questionId: q.id })}
              >
                {q.q}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
