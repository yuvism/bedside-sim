/**
 * Video validation mode (research): compare a simulated run with a reference
 * timeline annotated from a real treatment video.
 */
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Footer } from '../../app/Footer.tsx';
import { ThemeToggle } from '../../app/ThemeToggle.tsx';
import { LIBRARY } from '../../content/library.ts';
import { caseOptions } from '../caseOptions.ts';
import sampleCsv from '../../content/validation/anaphylaxis-01-sample.csv?raw';
import {
  DEFAULT_TOLERANCES,
  runValidation,
  suggestTransitions,
  type TransitionSpec,
} from '../../engine/validation/compare.ts';
import {
  parseReferenceCsv,
  REF_VITALS,
  type RefVital,
  type Reference,
} from '../../engine/validation/csv.ts';
import { buildScript } from '../../engine/validation/events.ts';
import { download } from '../debrief/exportRun.ts';
import { chartsPng } from './chartsPng.ts';
import ComparisonCharts from './ComparisonCharts.tsx';
import { buildReport } from './report.ts';
import { DivergenceList, EventsTable, MetricsTable } from './ResultTables.tsx';
import { TransitionsEditor } from './TransitionsEditor.tsx';
import { VITAL_INFO } from './vitals.ts';
import './validation.css';

const DOCS = 'https://github.com/yuvism/bedside-sim/blob/main/docs/validation.md';

const int = (s: string, fallback: number) => {
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

export default function ValidationPage() {
  const options = useMemo(() => caseOptions(), []);
  const [caseKey, setCaseKey] = useState(options[0]?.key ?? '');
  const [seed, setSeed] = useState(1);
  const [offset, setOffset] = useState(0);
  const [tolerances, setTolerances] = useState<Record<RefVital, number>>(DEFAULT_TOLERANCES);
  const [ref, setRef] = useState<{ name: string; data: Reference } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [specs, setSpecs] = useState<TransitionSpec[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const chosen = options.find((o) => o.key === caseKey);
  const result = useMemo(
    () =>
      ref && chosen
        ? runValidation(LIBRARY, chosen.caseDef, ref.data, {
            seed,
            offsetSec: offset,
            tolerances,
            transitions: specs,
          })
        : null,
    [ref, chosen, seed, offset, tolerances, specs],
  );
  const triggers = useMemo(
    () => [
      ...new Set(
        (result?.events ?? [])
          .filter((e) => e.code)
          .map((e) => (e.code ?? '').split(':').slice(0, 2).join(':')),
      ),
    ],
    [result],
  );

  const load = (name: string, text: string) => {
    try {
      const data = parseReferenceCsv(text);
      const metaCase = data.meta['case'];
      const nextKey = metaCase && options.some((o) => o.key === metaCase) ? metaCase : caseKey;
      const nextOffset = data.meta['offset'] ? int(data.meta['offset'], 0) : offset;
      if (data.meta['seed']) setSeed(int(data.meta['seed'], seed));
      setCaseKey(nextKey);
      setOffset(nextOffset);
      const c = options.find((o) => o.key === nextKey)?.caseDef;
      setSpecs(c ? suggestTransitions(buildScript(data, LIBRARY, c, nextOffset).events) : []);
      setRef({ name, data });
      setError(null);
    } catch (e) {
      setError(`Couldn’t read ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) load(file.name, await file.text());
  };

  const stem = `validation-${chosen?.caseDef.id ?? 'case'}-seed${seed}`;
  const exportJson = () => {
    if (!result || !chosen || !ref) return;
    const report = buildReport(result, {
      caseId: chosen.caseDef.id,
      caseVersion: chosen.caseDef.version,
      referenceName: ref.name,
      referenceRows: ref.data.rows.length,
      referenceMeta: ref.data.meta,
      tolerances,
      generatedAt: new Date().toISOString(),
    });
    download(`${stem}.json`, `${JSON.stringify(report, null, 2)}\n`, 'application/json');
  };
  const exportPng = async () => {
    if (!result || !chosen) return;
    setBusy(true);
    try {
      const blob = await chartsPng(result, `${chosen.caseDef.title}: simulated vs reference`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stem}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="bar">
        <div className="brand">
          <h1>
            <a href="#/">Bedside sim</a>
          </h1>
          <p>Video validation</p>
        </div>
        <a className="btn" href="#/">
          Cases
        </a>
        <ThemeToggle />
      </header>
      <main className="page validation">
        <h2 className="page-title">Video validation</h2>
        <p className="muted">
          Compare a simulated run with a reference timeline annotated from a real treatment video.
          The reference’s actions are replayed through the engine at their timestamps, with the same
          seed, and the vitals are compared point by point. See{' '}
          <a href={DOCS} target="_blank" rel="noreferrer">
            how to annotate a video
          </a>
          . Everything runs in your browser; nothing is uploaded.
        </p>

        <section className="card val-setup" aria-labelledby="setup-h">
          <h3 id="setup-h">Reference and simulation</h3>
          <div className="val-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => load('anaphylaxis-01-sample.csv', sampleCsv)}
            >
              Load sample
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Import reference CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              aria-label="Reference CSV file"
              onChange={(e) => void onFile(e)}
            />
            <span className="muted small" role="status">
              {ref ? `${ref.name}: ${ref.data.rows.length} rows` : 'No reference loaded.'}
            </span>
          </div>
          {ref?.data.meta['source'] && (
            <p className="small muted">Source: {ref.data.meta['source']}</p>
          )}
          {error && (
            <p className="hint warn" role="alert">
              {error}
            </p>
          )}
          {ref && ref.data.warnings.length > 0 && (
            <ul className="hint warn small">
              {ref.data.warnings.slice(0, 8).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="val-row">
            <label>
              Case
              <select
                className="input"
                value={caseKey}
                onChange={(e) => setCaseKey(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seed
              <input
                className="input num"
                type="number"
                value={seed}
                onChange={(e) => setSeed(int(e.target.value, seed))}
              />
            </label>
            <label>
              Offset (s)
              <input
                className="input num"
                type="number"
                value={offset}
                onChange={(e) => setOffset(int(e.target.value, offset))}
              />
            </label>
          </div>
          <p className="field-help">
            Sim time = reference time + offset. Use it to line up the start of the video with the
            start of the case.
          </p>
          <fieldset className="tolerances">
            <legend>Tolerance (flag differences larger than)</legend>
            {REF_VITALS.map((v) => (
              <label key={v}>
                {VITAL_INFO[v].title}
                <span className="tol-input">
                  ±
                  <input
                    className="input num"
                    type="number"
                    min={0}
                    step="any"
                    value={tolerances[v]}
                    onChange={(e) =>
                      setTolerances({
                        ...tolerances,
                        [v]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                  <span className="muted">{VITAL_INFO[v].unit}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        {result && (
          <>
            <section className="card val-results" aria-labelledby="cmp-h">
              <div className="val-head">
                <h3 id="cmp-h">Simulated vs reference</h3>
                <span className="val-actions">
                  <button type="button" className="btn" onClick={exportJson}>
                    Download report (JSON)
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void exportPng()}
                    disabled={busy}
                  >
                    Download charts (PNG)
                  </button>
                </span>
              </div>
              <p className="muted small">
                Replayed {result.events.filter((e) => e.action).length} of {result.events.length}{' '}
                events · sim outcome: {result.outcome ?? 'still running'}
              </p>
              <ComparisonCharts result={result} />
            </section>
            <section className="card" aria-labelledby="metrics-h">
              <h3 id="metrics-h">Agreement</h3>
              <MetricsTable result={result} />
              <h4>Where the sim diverges</h4>
              <DivergenceList result={result} />
            </section>
            <section className="card" aria-labelledby="tr-h">
              <h3 id="tr-h">Key transitions</h3>
              <TransitionsEditor
                specs={specs}
                results={result.transitions}
                triggers={triggers}
                onChange={setSpecs}
              />
            </section>
            <section className="card" aria-labelledby="ev-h">
              <h3 id="ev-h">Reference events</h3>
              <EventsTable result={result} />
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
