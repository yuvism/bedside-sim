import { useMemo, useState, type FormEvent } from 'react';
import { aiReady } from '../../app/aiSettings.ts';
import { MAX_QUESTION_CHARS } from '../../app/patientChat.ts';
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
      <AskBox locked={locked} />
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

function AskBox({ locked }: { locked: boolean }) {
  const ask = useSim((s) => s.ask);
  const asking = useSim((s) => s.asking);
  const notice = useSim((s) => s.askNotice);
  const ai = useSim((s) => s.ai);
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || locked || asking) return;
    setText('');
    void ask(q);
  };
  const how = aiReady(ai)
    ? `Claude (${ai.model}) answers, using only the case file.`
    : 'Matched offline to the questions below. Add an API key in Settings for free conversation.';
  return (
    <form className="group ask" onSubmit={submit}>
      <label className="field" htmlFor="ask-input">
        Ask the patient anything
      </label>
      <div className="ask-row">
        <input
          id="ask-input"
          className="input"
          maxLength={MAX_QUESTION_CHARS}
          autoComplete="off"
          placeholder="e.g. Has this ever happened before?"
          value={text}
          disabled={locked}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary" disabled={locked || asking || !text.trim()}>
          Ask
        </button>
      </div>
      <p className="hint" aria-live="polite">
        {asking ? 'The patient is answering…' : how}
      </p>
      {notice && (
        <p className="hint warn" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
