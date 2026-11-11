import { useMemo, useState } from 'react';
import { useSim } from '../../app/store.ts';
import { SCORE_DOMAINS, type ScoreDomain } from '../../engine/caseTypes.ts';
import { CRITICAL_CAP, lastDiagnosis, PASS_MARK, type RuleResult } from '../../engine/scoring.ts';
import { fmtClock } from '../format.ts';
import { buildChartData } from './chartData.ts';
import { copyText, download, fileStem, runExport } from './exportRun.ts';
import { VitalsChart } from './VitalsChart.tsx';
import type { BackLink } from './EndDialog.tsx';

const TITLES = {
  stabilised: (n: string) => `${n} is stable`,
  died: (n: string) => `${n} died`,
  ended: () => 'Case ended',
} as const;

const DOMAIN_LABEL: Record<ScoreDomain, string> = {
  assessment: 'Assessment',
  diagnosis: 'Diagnosis',
  management: 'Management',
  safety: 'Safety (penalties)',
};

const MARK: Record<RuleResult['status'], string> = {
  done: '✓',
  avoided: '✓',
  missed: '✗',
  harmful: '!',
};

function ruleNote(r: RuleResult): string {
  const bits: string[] = [];
  if (r.detail) bits.push(r.detail);
  if (r.firstT !== null && r.status === 'done') bits.push(`at ${fmtClock(r.firstT)}`);
  if (r.critical && !r.passed) bits.push('critical');
  return bits.join(' · ');
}

export default function Debrief({
  onRestart,
  onClose,
  back,
}: {
  onRestart: () => void;
  onClose: () => void;
  back: BackLink;
}) {
  const session = useSim((s) => s.session);
  const reason = useSim((s) => s.endReason);
  const score = useSim((s) => s.score);
  const progress = useSim((s) => s.progress);
  const mode = useSim((s) => s.mode);
  const replayFrom = useSim((s) => s.replayFrom);
  const [copied, setCopied] = useState<string | null>(null);
  const [minute, setMinute] = useState(0);

  const chart = useMemo(
    () => (session ? buildChartData(session.recorder.trace, session.events) : null),
    [session],
  );
  if (!session || !score || !chart) return null;

  const c = session.caseDef;
  const first = c.patient.name.split(' ')[0] ?? 'Patient';
  const dx = lastDiagnosis(session.events);
  const dxLabel = (id: string | null) =>
    id ? (c.diagnosis.options.find((o) => o.id === id)?.label ?? id) : 'none chosen';
  const correct = c.diagnosis.correct.map((id) => dxLabel(id)).join(' or ');
  const lastMinute = Math.max(0, ...session.snapshots.keys());
  const stem = fileStem(session);
  const exportJson = () => JSON.stringify(runExport(session, score.percent), null, 2);

  const copy = async (what: 'json' | 'csv') => {
    const ok = await copyText(what === 'json' ? exportJson() : session.recorder.traceCSV());
    setCopied(ok ? `${what.toUpperCase()} copied` : 'Copy failed. Use download instead.');
  };

  return (
    <div className="dlg">
      <h2 id="db-title">{reason ? TITLES[reason](first) : 'Case review'}</h2>
      <p className="muted">
        {c.title} · case time {fmtClock(session.t)} · seed {session.seed}
      </p>

      <div className="score-row">
        <p className="score" aria-label={`Score ${score.percent} out of 100`}>
          {score.percent}
          <small> / 100</small>
        </p>
        <div className="score-meta">
          {progress && (
            <p>
              Best {progress.best} · attempt {progress.attempts}
            </p>
          )}
          <p>
            Your diagnosis: <strong>{dxLabel(dx)}</strong>. Expected: {correct}.
          </p>
          {score.capped && (
            <p className="warn-text">
              Capped at {CRITICAL_CAP} because a critical step was missed or a harmful action was
              taken.
            </p>
          )}
        </div>
      </div>

      <h3>{mode === 'exam' ? 'OSCE breakdown' : 'By domain'}</h3>
      <table className="domains">
        <thead>
          <tr>
            <th scope="col">Domain</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody>
          {SCORE_DOMAINS.filter(
            (d) => score.domains[d].max > 0 || score.domains[d].earned !== 0,
          ).map((d) => (
            <tr key={d}>
              <th scope="row">{DOMAIN_LABEL[d]}</th>
              <td>
                {score.domains[d].earned} / {score.domains[d].max}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {mode === 'exam' && (
        <p className={`verdict ${score.pass ? 'pass' : 'fail'}`}>
          {score.pass ? 'Pass' : 'Not yet a pass'}: pass mark {PASS_MARK}% with no critical step
          missed.
        </p>
      )}
      {session.variations.length > 0 && (
        <p className="muted small">
          This patient's variation: {session.variations.map((v) => v.label).join(', ')}.
        </p>
      )}

      <h3>Checklist</h3>
      <ul className="check">
        {score.results.map((r) => (
          <li key={r.id} className={r.status}>
            <span className="m" aria-label={r.status}>
              {MARK[r.status]}
            </span>
            <span>
              {r.label}
              {ruleNote(r) && <small> · {ruleNote(r)}</small>}
            </span>
            <span className="pts">{r.points > 0 ? `+${r.points}` : r.points}</span>
          </li>
        ))}
      </ul>

      <h3>Vitals and actions</h3>
      <VitalsChart points={chart.points} markers={chart.markers} maxMin={chart.maxMin} />
      <ol className="markers">
        {chart.markers.map((m) => (
          <li key={m.n} className={m.harmful ? 'harmful' : ''}>
            <span className="mk" aria-hidden="true">
              {m.n}
            </span>
            <time>{fmtClock(m.t)}</time>
            <span>{m.label}</span>
          </li>
        ))}
      </ol>
      <details className="table-view">
        <summary>Vitals as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">HR</th>
              <th scope="col">BP</th>
              <th scope="col">SpO₂</th>
              <th scope="col">RR</th>
              <th scope="col">EtCO₂</th>
            </tr>
          </thead>
          <tbody>
            {session.recorder.trace
              .filter((r) => r.t % 60 === 0)
              .map((r) => (
                <tr key={r.t}>
                  <td>{fmtClock(r.t)}</td>
                  <td>{r.hr ?? '–'}</td>
                  <td>{r.sbp === null ? '–' : `${Math.round(r.sbp)}/${Math.round(r.dbp ?? 0)}`}</td>
                  <td>{r.spo2 ?? '–'}</td>
                  <td>{r.rr}</td>
                  <td>{r.etco2}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>

      {score.teaching.length > 0 && (
        <>
          <h3>Teaching points</h3>
          <ul className="notes">
            {score.teaching.map((t) => (
              <li key={t.id}>{t.text}</li>
            ))}
          </ul>
        </>
      )}

      {c.references.length > 0 && (
        <>
          <h3>References</h3>
          <ul className="refs">
            {c.references.map((r) => (
              <li key={r.id}>{r.url ? <a href={r.url}>{r.label}</a> : r.label}</li>
            ))}
          </ul>
        </>
      )}

      <h3>Export</h3>
      <p className="muted small">
        Timestamped events plus vitals every 15 seconds of sim time, in the same format used for
        video validation.
      </p>
      <div className="row">
        <button className="btn" onClick={() => void copy('json')}>
          Copy JSON
        </button>
        <button
          className="btn"
          onClick={() => download(`${stem}-run.json`, exportJson(), 'application/json')}
        >
          Download JSON
        </button>
        <button className="btn" onClick={() => void copy('csv')}>
          Copy CSV
        </button>
        <button
          className="btn"
          onClick={() => download(`${stem}-vitals.csv`, session.recorder.traceCSV(), 'text/csv')}
        >
          Download vitals CSV
        </button>
        <button
          className="btn"
          onClick={() => download(`${stem}-events.csv`, session.recorder.eventsCSV(), 'text/csv')}
        >
          Download events CSV
        </button>
      </div>
      <p className="muted small" aria-live="polite">
        {copied ?? ''}
      </p>

      <div className="row replay">
        <label>
          Replay from minute{' '}
          <select value={minute} onChange={(e) => setMinute(Number(e.target.value))}>
            {Array.from({ length: lastMinute + 1 }, (_, m) => (
              <option key={m} value={m}>
                {fmtClock(m * 60)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={() => replayFrom(minute)}>
          Replay from {fmtClock(minute * 60)}
        </button>
      </div>
      <div className="row">
        <button className="btn primary" onClick={onRestart}>
          Restart case
        </button>
        <a className="btn" href={back.href}>
          {back.label}
        </a>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="fine">Educational simulation. Simplified physiology. Not clinical guidance.</p>
    </div>
  );
}
