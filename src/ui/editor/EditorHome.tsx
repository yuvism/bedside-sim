/** Case editor home: drafts in this browser, new case, import and duplicate. */
import { useRef, useState, type ChangeEvent } from 'react';
import {
  copyOfCase,
  deleteDraft,
  draftCaseId,
  draftTitle,
  listDrafts,
  newDraft,
  saveDraft,
  type Draft,
} from '../../app/drafts.ts';
import { Footer } from '../../app/Footer.tsx';
import { editorHref, testHref } from '../../app/router.ts';
import { ThemeToggle } from '../../app/ThemeToggle.tsx';
import { CASES, checkCase } from '../../content/library.ts';
import { exportDraft } from './exportDraft.ts';
import { templateCase } from './template.ts';
import './editor.css';

const when = (t: number) =>
  new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function EditorHome() {
  const [drafts, setDrafts] = useState(listDrafts);
  const [message, setMessage] = useState<string | null>(null);
  const [pick, setPick] = useState(CASES[0]?.id ?? '');
  const fileRef = useRef<HTMLInputElement>(null);

  const open = (data: unknown) => {
    const d = newDraft(data);
    const err = saveDraft(d);
    if (err) setMessage(err);
    else window.location.hash = editorHref(d.id);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      open(JSON.parse(await file.text()) as unknown);
    } catch {
      setMessage(`“${file.name}” isn’t valid JSON, so it wasn’t imported.`);
    }
  };

  const remove = (d: Draft) => {
    if (!window.confirm(`Delete the draft “${draftTitle(d)}”? This can’t be undone.`)) return;
    const err = deleteDraft(d.id);
    if (err) setMessage(err);
    setDrafts(listDrafts());
  };

  const libraryCase = CASES.find((c) => c.id === pick);

  return (
    <>
      <header className="bar">
        <div className="brand">
          <h1>
            <a href="#/">Bedside sim</a>
          </h1>
          <p>Case editor</p>
        </div>
        <a className="btn" href="#/">
          Cases
        </a>
        <ThemeToggle />
      </header>
      <main className="page editor-home">
        <h2 className="page-title">Case editor</h2>
        <p className="muted">
          Build a case with forms instead of writing JSON. Drafts are saved in this browser only, so
          export the JSON to keep a case or share it.
        </p>

        <section className="card editor-start" aria-label="Start a case">
          <button type="button" className="btn primary" onClick={() => open(templateCase())}>
            New case
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Case JSON file"
            onChange={(e) => void onFile(e)}
          />
          <span className="start-dup">
            <label htmlFor="dup-pick">Duplicate a library case</label>
            <select
              id="dup-pick"
              className="input"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              {CASES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.id})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!libraryCase}
              onClick={() => libraryCase && open(copyOfCase(libraryCase))}
            >
              Duplicate
            </button>
          </span>
        </section>
        {message && (
          <p className="hint warn" role="status">
            {message}
          </p>
        )}

        <h3>Your drafts</h3>
        {drafts.length === 0 && <p className="muted">No drafts yet.</p>}
        <ul className="draft-list">
          {drafts.map((d) => {
            const ok = checkCase(d.data).ok;
            return (
              <li key={d.id} className="card draft">
                <div className="draft-main">
                  <a href={editorHref(d.id)} className="draft-title">
                    {draftTitle(d)}
                  </a>
                  <span className="muted small">
                    {draftCaseId(d)} · edited {when(d.updated)}
                  </span>
                </div>
                <span className={`chip ${ok ? 'on' : 'bad'}`}>{ok ? 'Valid' : 'Has problems'}</span>
                <span className="draft-actions">
                  <a className="btn small" href={editorHref(d.id)}>
                    Edit
                  </a>
                  {ok && (
                    <a className="btn small" href={testHref(d.id)}>
                      Test run
                    </a>
                  )}
                  <button type="button" className="btn small" onClick={() => exportDraft(d)}>
                    Export
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => open(copyOfCase(d.data))}
                  >
                    Duplicate
                  </button>
                  <button type="button" className="btn small danger" onClick={() => remove(d)}>
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </main>
      <Footer />
    </>
  );
}
