/**
 * "Learn from a video" (teacher console): turn a treatment video into a
 * timeline, by hand or with "Autofill with AI", then let the server fit the
 * case to it and propose what's missing. Every change lands in an editor
 * draft for review first.
 */
import { useMemo, useState, type ChangeEvent } from 'react';
import { newDraft, saveDraft } from '../../app/drafts.ts';
import { Footer } from '../../app/Footer.tsx';
import { editorHref, testHref } from '../../app/router.ts';
import { useSim } from '../../app/store.ts';
import { LIBRARY } from '../../content/library.ts';
import amax4Csv from '../../content/validation/amax4-simulation-annotation.csv?raw';
import type { FitProgress } from '../../engine/learning/fit.ts';
import { applyUpdate, type Addition } from '../../engine/learning/propose.ts';
import { parseReferenceCsv } from '../../engine/validation/csv.ts';
import { analyseOnServer, type Analysis, type AutofillReply } from '../../teacher/api.ts';
import { caseOptions } from '../caseOptions.ts';
import { download } from '../debrief/exportRun.ts';
import { buildLists } from '../editor/suggestions.ts';
import { Annotator } from './Annotator.tsx';
import { AutofillPanel } from './AutofillPanel.tsx';
import { Proposals } from './Proposals.tsx';
import { rowsFromReference, rowsToCsv, type Row } from './rows.ts';
import { TeacherHeader } from '../../teacher/TeacherHeader.tsx';
import './learn.css';

const DEFAULT_ON: Addition['kind'][] = ['scoring', 'investigation', 'patientLine'];

export default function LearnPage() {
  const options = useMemo(() => caseOptions(), []);
  const ai = useSim((s) => s.ai);
  const [caseKey, setCaseKey] = useState(options[0]?.key ?? '');
  const [seed, setSeed] = useState(1);
  const [name, setName] = useState('My video');
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<FitProgress | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [changeOn, setChangeOn] = useState<Set<string>>(new Set());
  const [addOn, setAddOn] = useState<Set<string>>(new Set());
  const [draftId, setDraftId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [analyseError, setAnalyseError] = useState<string | null>(null);

  const chosen = options.find((o) => o.key === caseKey);
  const codes = useMemo(
    () => (chosen ? (buildLists(chosen.caseDef, LIBRARY)['codes'] ?? []) : []),
    [chosen],
  );

  const loadCsv = (fileName: string, text: string) => {
    try {
      const ref = parseReferenceCsv(text);
      setRows(rowsFromReference(ref));
      setMeta(ref.meta);
      setName(fileName.replace(/\.csv$/i, ''));
      const metaCase = ref.meta['case'];
      if (metaCase && options.some((o) => o.key === metaCase)) setCaseKey(metaCase);
      if (ref.meta['seed']) setSeed(Number(ref.meta['seed']) || 1);
      setAnalysis(null);
      setDraftId(null);
      setMessage(ref.warnings.length ? ref.warnings.join(' ') : null);
    } catch (e) {
      setMessage(`Couldn’t read ${fileName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onVideo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setVideoFile(f);
    setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const onCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) loadCsv(f.name, await f.text());
  };

  const aiRows = rows.filter((r) => r.ai).length;

  const onFilled = (reply: AutofillReply) => {
    setRows(reply.rows.map((r) => ({ ...r, ai: true })));
    setMeta((m) => ({ ...m, autofill: `${reply.model}, checked by a person` }));
    setAnalysis(null);
    setDraftId(null);
  };

  const analyse = async () => {
    if (!chosen || rows.length === 0 || aiRows > 0) return;
    setAnalysis(null);
    setDraftId(null);
    setAnalyseError(null);
    setProgress({ evals: 0, maxEvals: 300, score: 0 });
    try {
      const result = await analyseOnServer(
        { caseJson: chosen.caseDef, csv: rowsToCsv(rows, meta), seed, name },
        setProgress,
      );
      setAnalysis(result);
      setChangeOn(new Set(result.fit.changes.map((c) => c.tunable.id)));
      setAddOn(
        new Set(result.additions.filter((x) => DEFAULT_ON.includes(x.kind)).map((x) => x.id)),
      );
    } catch (e) {
      setAnalyseError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const createDraft = () => {
    if (!chosen || !analysis) return;
    const base = chosen.caseDef;
    const updated = applyUpdate({
      base,
      changes: analysis.fit.changes.filter((c) => changeOn.has(c.tunable.id)),
      additions: analysis.additions.filter((a) => addOn.has(a.id)),
      newId: `${base.id}-video`,
      newTitle: `${base.title} (from video)`,
      referenceName: name,
      date: new Date().toISOString().slice(0, 10),
    });
    const d = newDraft(updated);
    const err = saveDraft(d);
    if (err) setMessage(err);
    else setDraftId(d.id);
  };

  const exportPack = () => {
    if (!analysis || !chosen) return;
    const pack = {
      format: 'bedside-sim-update-pack',
      formatVersion: 1,
      disclaimer: 'Educational simulation. Simplified physiology. Not clinical guidance.',
      createdAt: new Date().toISOString(),
      reference: { name, meta, csv: rowsToCsv(rows, meta) },
      case: { id: chosen.caseDef.id, version: chosen.caseDef.version, seed },
      fit: {
        scoreBefore: analysis.fit.scoreBefore,
        scoreAfter: analysis.fit.scoreAfter,
        rmseBefore: analysis.fit.rmseBefore,
        rmseAfter: analysis.fit.rmseAfter,
        changes: analysis.fit.changes.map((c) => ({
          id: c.tunable.id,
          label: c.tunable.label,
          before: c.before,
          after: c.after,
          accepted: changeOn.has(c.tunable.id),
        })),
      },
      additions: analysis.additions.map((a) => ({
        ...a,
        accepted: a.kind !== 'library' && addOn.has(a.id),
      })),
    };
    download(
      `update-pack-${chosen.caseDef.id}.json`,
      `${JSON.stringify(pack, null, 2)}\n`,
      'application/json',
    );
  };

  return (
    <>
      <TeacherHeader current="learn" />
      <main className="page learn">
        <h2 className="page-title">Learn from a video</h2>
        <p className="muted">
          Turn a treatment video into a timeline, by hand or with <strong>Autofill with AI</strong>.
          The simulation then <strong>updates itself</strong> so its vitals follow the video, and{' '}
          <strong>proposes what’s missing</strong>: scoring for what the team did, prompts, test
          results and library gaps. Nothing changes until you approve it in a draft.
        </p>
        <p className="privacy" role="note">
          <strong>Patient videos are confidential.</strong> Use only de-identified videos you have
          consent and approval to use. The video stays on this computer unless you press{' '}
          <strong>Autofill with AI</strong>: then it goes to the teacher server and on to Google’s
          Gemini, and is deleted from both straight after. “Read monitor with Claude” sends single
          frames to Anthropic with your own key. Use either only where your approvals allow.
        </p>

        <section className="card" aria-labelledby="step1">
          <h3 id="step1">1. The video and the closest case</h3>
          <div className="learn-row">
            <label className="btn">
              Open a video file
              <input type="file" accept="video/*" hidden onChange={onVideo} />
            </label>
            <label className="btn">
              Import a timeline CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => void onCsv(e)} />
            </label>
            <button
              type="button"
              className="btn primary"
              onClick={() => loadCsv('amax4-simulation-annotation.csv', amax4Csv)}
            >
              Load the AMAX4 example
            </button>
          </div>
          <div className="learn-row">
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
          </div>
          {meta['source'] && <p className="muted small">Source: {meta['source']}</p>}
          {message && (
            <p className="hint warn" role="status">
              {message}
            </p>
          )}
        </section>

        <AutofillPanel
          file={videoFile}
          caseDef={chosen?.caseDef}
          rowCount={rows.length}
          onFilled={onFilled}
        />

        <section className="card" aria-labelledby="step2">
          <h3 id="step2">3. Check and annotate</h3>
          <p className="muted small">
            Record the monitor every 10–30 seconds and every action when it happens. Leave anything
            you can’t read blank. Action ids match the engine’s log (see docs/validation.md);
            anything else becomes a note.
          </p>
          <Annotator rows={rows} onRows={setRows} videoUrl={videoUrl} ai={ai} codes={codes} />
          {rows.length > 0 && (
            <button
              type="button"
              className="btn small"
              onClick={() => download(`${name}.csv`, rowsToCsv(rows, meta), 'text/csv')}
            >
              Download timeline CSV
            </button>
          )}
        </section>

        <section className="card" aria-labelledby="step3">
          <h3 id="step3">4. Update and add what’s missing</h3>
          <div className="learn-row">
            <label>
              Seed
              <input
                className="input num"
                type="number"
                value={seed}
                onChange={(e) => setSeed(Math.round(Number(e.target.value)) || 1)}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={!rows.length || progress !== null || aiRows > 0}
              onClick={() => void analyse()}
            >
              Analyse the video
            </button>
          </div>
          {aiRows > 0 && (
            <p className="muted small">
              Check the {aiRows} AI row{aiRows === 1 ? '' : 's'} in step 3 first.
            </p>
          )}
          {analyseError && (
            <p className="hint warn" role="alert">
              {analyseError}
            </p>
          )}
          {progress && (
            <div className="fit-progress" role="status">
              <progress max={progress.maxEvals} value={progress.evals} /> Fitting on the server…{' '}
              {progress.evals} engine runs
            </div>
          )}
          {analysis && (
            <>
              <Proposals
                fit={analysis.fit}
                additions={analysis.additions}
                changeOn={changeOn}
                addOn={addOn}
                onToggleChange={(id) => setChangeOn((s) => toggle(s, id))}
                onToggleAdd={(id) => setAddOn((s) => toggle(s, id))}
              />
              <div className="learn-row">
                <button type="button" className="btn primary" onClick={createDraft}>
                  Create a draft for review
                </button>
                <button type="button" className="btn" onClick={exportPack}>
                  Download update pack
                </button>
              </div>
              {draftId && (
                <p className="draft-ok" role="status">
                  Draft created. <a href={editorHref(draftId)}>Review it in the editor</a> or{' '}
                  <a href={testHref(draftId)}>test-run it</a>. Values are flagged for clinical
                  review.
                </p>
              )}
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
