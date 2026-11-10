/**
 * The case editor: one section of the case at a time, drawn from the Zod
 * schema, with live validation, autosave to localStorage, and a test run.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { z } from 'zod';
import {
  copyOfCase,
  deleteDraft,
  draftCaseId,
  draftTitle,
  getDraft,
  newDraft,
  saveDraft,
  type Draft,
} from '../../app/drafts.ts';
import { Footer } from '../../app/Footer.tsx';
import { editorHref, testHref } from '../../app/router.ts';
import { ThemeToggle } from '../../app/ThemeToggle.tsx';
import { LIBRARY } from '../../content/library.ts';
import { CaseSchema } from '../../content/schema.ts';
import { exportDraft } from './exportDraft.ts';
import { FormContext, indexIssues, pathKey, type Path } from './form/context.ts';
import { SchemaField } from './form/SchemaField.tsx';
import { labelFor } from './form/labels.ts';
import { RawJson } from './RawJson.tsx';
import { RAW_SECTION, SECTIONS, sectionOfKey } from './sections.ts';
import { buildLists, datalistId, listFor } from './suggestions.ts';
import { checkDraft } from './validateDraft.ts';
import './editor.css';

const SHAPE = CaseSchema.shape as unknown as Record<string, z.core.$ZodType>;
const SAVE_DELAY_MS = 300;
const MAX_LISTED = 40;

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const pathLabel = (p: Path) =>
  p.map((x) => (typeof x === 'number' ? `#${x + 1}` : labelFor(x))).join(' › ');

/** The draft with new data, stamped with the time of the edit. */
const edited = (d: Draft, data: unknown): Draft => ({ ...d, data, updated: Date.now() });

/** Opens collapsed items around a field, scrolls to it and focuses it. */
function reveal(path: Path): void {
  for (let n = path.length; n > 0; n--) {
    const el = document.querySelector<HTMLElement>(
      `[data-path="${CSS.escape(pathKey(path.slice(0, n)))}"]`,
    );
    if (!el) continue;
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null)
      d.open = true;
    el.scrollIntoView({ block: 'center' });
    el.querySelector<HTMLElement>('input, select, textarea, button')?.focus({
      preventScroll: true,
    });
    return;
  }
}

export default function CaseEditor({ draftId }: { draftId: string }) {
  const [draft, setDraft] = useState<Draft | undefined>(() => getDraft(draftId));
  const [section, setSection] = useState(SECTIONS[0]?.id ?? RAW_SECTION);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pending = useRef<Draft | null>(null);

  const data = draft?.data;
  const check = useMemo(() => checkDraft(data), [data]);
  const lists = useMemo(() => buildLists(data, LIBRARY), [data]);
  const ctx = useMemo(
    () => ({
      issues: indexIssues(check.issues),
      suggestionList: (key: string, path: Path) => {
        const l = listFor(key, path, data);
        return l ? datalistId(l) : undefined;
      },
    }),
    [check.issues, data],
  );

  // Autosave shortly after each change, and on the way out.
  useEffect(() => {
    if (!draft || pending.current !== draft) return;
    const id = setTimeout(() => {
      setSaveError(saveDraft(draft));
      pending.current = null;
    }, SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [draft]);
  useEffect(
    () => () => {
      if (pending.current) saveDraft(pending.current);
    },
    [],
  );

  if (!draft) {
    return (
      <>
        <main className="page">
          <h2 className="page-title">Draft not found</h2>
          <p>It may have been deleted, or saved in another browser.</p>
          <a className="btn primary" href={editorHref()}>
            All drafts
          </a>
        </main>
        <Footer />
      </>
    );
  }

  const update = (next: unknown) => {
    const d = edited(draft, next);
    pending.current = d;
    setDraft(d);
  };
  const flush = () => {
    if (pending.current) setSaveError(saveDraft(pending.current));
    pending.current = null;
  };
  const obj = asObject(data);
  const setKey = (k: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[k];
    else next[k] = v;
    update(next);
  };

  const count = (keys: readonly string[]) =>
    check.issues.filter((i) => keys.includes(String(i.path[0]))).length;
  const total = check.issues.length + check.refIssues.length;
  const current = SECTIONS.find((s) => s.id === section);

  const testRun = () => {
    flush();
    window.location.hash = testHref(draft.id);
  };
  const duplicate = () => {
    flush();
    const d = newDraft(copyOfCase(data));
    const err = saveDraft(d);
    if (err) setSaveError(err);
    else window.location.hash = editorHref(d.id);
  };
  const remove = () => {
    if (!window.confirm(`Delete the draft “${draftTitle(draft)}”? This can’t be undone.`)) return;
    pending.current = null;
    deleteDraft(draft.id);
    window.location.hash = editorHref();
  };
  const goTo = (p: Path) => {
    // Render the field's section first, then find the field in the DOM.
    flushSync(() => setSection(sectionOfKey(String(p[0]))));
    reveal(p);
  };

  return (
    <FormContext.Provider value={ctx}>
      <header className="bar">
        <div className="brand">
          <h1>
            <a href="#/">Bedside sim</a>
          </h1>
          <p>Case editor · {draftTitle(draft)}</p>
        </div>
        <a className="btn" href={editorHref()}>
          All drafts
        </a>
        <ThemeToggle />
      </header>
      <main className="page case-editor">
        <section className="card editor-toolbar" aria-label="Draft">
          <div className="toolbar-title">
            <strong>{draftTitle(draft)}</strong>
            <span className="muted small">
              {draftCaseId(draft)} · {saveError ? 'not saved' : 'saved in this browser'}
            </span>
          </div>
          <span className={`chip ${check.ok ? 'on' : 'bad'}`} role="status">
            {check.ok ? 'Valid: ready to test-run' : `${total} problem${total === 1 ? '' : 's'}`}
          </span>
          <span className="toolbar-actions">
            <button type="button" className="btn primary" disabled={!check.ok} onClick={testRun}>
              Test run
            </button>
            <button type="button" className="btn" onClick={() => exportDraft(draft)}>
              Export JSON
            </button>
            <button type="button" className="btn" onClick={duplicate}>
              Duplicate
            </button>
            <button type="button" className="btn danger" onClick={remove}>
              Delete
            </button>
          </span>
          {saveError && (
            <p className="hint warn" role="alert">
              {saveError}
            </p>
          )}
        </section>

        {total > 0 && (
          <details className="card problems" open>
            <summary>
              Problems ({total}) <span className="muted small">Select one to go to the field.</span>
            </summary>
            <ul>
              {check.issues.slice(0, MAX_LISTED).map((i) => (
                <li key={`${pathKey(i.path)}:${i.message}`}>
                  <button type="button" className="link-btn" onClick={() => goTo(i.path)}>
                    {pathLabel(i.path) || 'Case'}
                  </button>
                  : {i.message}
                </li>
              ))}
              {check.refIssues.map((m) => (
                <li key={m}>{m}</li>
              ))}
              {check.issues.length > MAX_LISTED && (
                <li className="muted">…and {check.issues.length - MAX_LISTED} more.</li>
              )}
            </ul>
          </details>
        )}

        <div className="editor-body">
          <nav className="editor-nav" aria-label="Case sections">
            {[...SECTIONS, { id: RAW_SECTION, label: 'Raw JSON', keys: [] as string[] }].map(
              (s) => {
                const n = count(s.keys);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`nav-item${s.id === section ? ' is-on' : ''}`}
                    aria-current={s.id === section ? 'page' : undefined}
                    onClick={() => setSection(s.id)}
                  >
                    {s.label}
                    {n > 0 && <span className="nav-count">{n}</span>}
                  </button>
                );
              },
            )}
          </nav>
          <section className="card editor-section" aria-label={current?.label ?? 'Raw JSON'}>
            <h2>{current?.label ?? 'Raw JSON'}</h2>
            {current?.intro && <p className="muted small">{current.intro}</p>}
            {current ? (
              current.keys.map((k) => {
                const schema = SHAPE[k];
                return schema ? (
                  <SchemaField
                    key={k}
                    schema={schema}
                    value={obj[k]}
                    onChange={(v) => setKey(k, v)}
                    path={[k]}
                    name={k}
                  />
                ) : null;
              })
            ) : (
              <RawJson value={data} onApply={update} />
            )}
          </section>
        </div>
        {Object.entries(lists).map(([k, values]) => (
          <datalist key={k} id={datalistId(k)}>
            {values.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        ))}
      </main>
      <Footer />
    </FormContext.Provider>
  );
}
