/** Cases this console has published to students, with unpublish and "edit a copy". */
import { useCallback, useEffect, useState } from 'react';
import { newDraft, saveDraft } from '../app/drafts.ts';
import { Footer } from '../app/Footer.tsx';
import { PageIntro } from '../app/home/SiteHeader.tsx';
import { editorHref } from '../app/router.ts';
import { BUNDLED } from '../content/cases.ts';
import { listPublished, unpublish } from './api.ts';
import { TeacherHeader } from './TeacherHeader.tsx';
import { STUDENT_URL } from './urls.ts';
import './teacher.css';

interface Item {
  id: string;
  title: string;
  specialty: string;
  raw: unknown;
}

const field = (raw: unknown, k: string): string => {
  const v = (raw as Record<string, unknown> | null)?.[k];
  return typeof v === 'string' ? v : '';
};

export function PublishedPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);

  const load = useCallback(() => {
    listPublished().then(
      (list) =>
        setItems(
          list.map((raw) => ({
            id: field(raw, 'id'),
            title: field(raw, 'title'),
            specialty: field(raw, 'specialty'),
            raw,
          })),
        ),
      (e: unknown) => setNote({ text: e instanceof Error ? e.message : String(e), warn: true }),
    );
  }, []);

  useEffect(load, [load]);

  const remove = async (it: Item) => {
    if (!window.confirm(`Unpublish “${it.title}”? Students won’t see it any more.`)) return;
    try {
      await unpublish(it.id);
      setNote({ text: `Unpublished ${it.id}.`, warn: false });
      load();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), warn: true });
    }
  };

  const editCopy = (it: Item) => {
    const d = newDraft(it.raw);
    const err = saveDraft(d);
    if (err) setNote({ text: err, warn: true });
    else window.location.assign(editorHref(d.id));
  };

  return (
    <>
      <TeacherHeader current="published" />
      <main className="page teach">
        <PageIntro eyebrow="Teacher console" title="Published to students">
          These cases come from this server. The student app adds them to its case list when it’s
          connected (VITE_API_URL). A published case with the same id as a built-in one replaces it.
        </PageIntro>
        {note && (
          <p className={note.warn ? 'hint warn' : 'hint'} role="status">
            {note.text}
          </p>
        )}
        {items === null && !note && <p className="muted">Loading…</p>}
        {items?.length === 0 && (
          <p className="muted">
            Nothing published yet. Make a draft in <a href="#/learn">Learn from a video</a> or the{' '}
            <a href="#/editor">case editor</a>, then press Publish to students.
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="published-list">
            {items.map((it) => (
              <li key={it.id} className="card">
                <div>
                  <strong>{it.title}</strong>
                  <span className="muted small">
                    {' '}
                    · {it.id}
                    {it.specialty && ` · ${it.specialty}`}
                    {BUNDLED.some((b) => b.id === it.id) && ' · replaces the built-in case'}
                  </span>
                </div>
                <span className="toolbar-actions">
                  <a
                    className="btn small"
                    href={`${STUDENT_URL}#/case/${encodeURIComponent(it.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in student app ↗
                  </a>
                  <button type="button" className="btn small" onClick={() => editCopy(it)}>
                    Edit a copy
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => void remove(it)}
                  >
                    Unpublish
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}
