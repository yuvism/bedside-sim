/**
 * "Unknown patient": the department board of patients waiting to be seen.
 * Each card shows what triage would know: bay, name, age, presenting
 * complaint and arrival observations with a NEWS2 score. The specialty,
 * diagnosis and topic tags stay hidden until the debrief.
 */
import { useMemo, useState } from 'react';
import { CASES } from '../../content/library.ts';
import type { CaseDef } from '../../engine/types.ts';
import {
  BOARD,
  bayOf,
  DIFFICULTY,
  matchesQuery,
  patientCode,
  summaryOf,
  surpriseHref,
  triageOf,
  type Difficulty,
  type Triage,
} from '../caseMeta.ts';
import { Footer } from '../Footer.tsx';
import { NEWS2_SOURCE } from '../news2.ts';
import { getProgress } from '../progress.ts';
import { patientHref } from '../router.ts';
import { IconClock, IconShuffle } from './icons.tsx';
import { PageIntro, SiteHeader } from './SiteHeader.tsx';
import { DifficultyChip } from './TopicsPage.tsx';
import './home.css';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const num = (v: number | null, digits = 0) => (v === null ? '—' : v.toFixed(digits));

function Seen({ caseId }: { caseId: string }) {
  const p = getProgress(caseId);
  return p ? (
    <span className="progress done">Seen · best {p.best}</span>
  ) : (
    <span className="progress muted">Not seen yet</span>
  );
}

function News2Badge({ t }: { t: Triage }) {
  if (!t.news2) {
    return (
      <span className="news2 none" title="NEWS2 is not used under 16 years.">
        NEWS2 n/a
      </span>
    );
  }
  const n = t.news2;
  const detail = `${n.label} risk: ${n.response}.${n.missing.length ? ` Not measurable: ${n.missing.join(', ')}.` : ''}`;
  return (
    <span className={`news2 ${n.risk}`} title={detail}>
      NEWS2 <b>{n.score}</b>
      <span className="news2-risk">
        {n.label}
        {n.risk === 'low' && n.singleRed ? ' · red score' : ''}
      </span>
    </span>
  );
}

function PatientCard({ c, seed }: { c: CaseDef; seed: number }) {
  const t = useMemo(() => triageOf(c, seed), [c, seed]);
  const o = t.obs;
  return (
    <li className="card patient-card">
      <div className="pc-top">
        <span className="bay-badge">Bay {bayOf(c.id)}</span>
        <News2Badge t={t} />
      </div>
      <div className="pc-who">
        <span className="avatar-dot" aria-hidden="true">
          {initials(t.name)}
        </span>
        <span>
          <strong>{t.name}</strong>
          <span className="muted">
            , {t.age} {t.sex === 'female' ? 'F' : t.sex === 'male' ? 'M' : ''}
          </span>
        </span>
      </div>
      <h3>
        <a href={patientHref(patientCode(c.id), seed)}>{c.title}</a>
      </h3>
      <p className="summary">{summaryOf(c, t.age)}</p>
      <dl className="obs" aria-label="Observations on arrival">
        <div>
          <dt>HR</dt>
          <dd>{num(o.hr)}</dd>
        </div>
        <div>
          <dt>BP</dt>
          <dd>{o.sbp === null ? '—' : `${num(o.sbp)}/${num(t.dbp)}`}</dd>
        </div>
        <div>
          <dt>SpO₂</dt>
          <dd>{o.spo2 === null ? '—' : `${num(o.spo2)}%`}</dd>
        </div>
        <div>
          <dt>RR</dt>
          <dd>{num(o.rr)}</dd>
        </div>
        <div>
          <dt>T</dt>
          <dd>{num(o.temp, 1)}</dd>
        </div>
      </dl>
      <p className="meta foot">
        <DifficultyChip d={c.difficulty} />
        <span className="time" title="Typical length of the case in simulated time">
          <IconClock size={16} /> ~{c.estMinutes} min
        </span>
        <Seen caseId={c.id} />
      </p>
    </li>
  );
}

export function PatientsPage() {
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [query, setQuery] = useState('');
  // One seed per patient for this visit, so the patient on the card is the one you meet.
  const [seeds] = useState(() =>
    Object.fromEntries(CASES.map((c) => [c.id, Math.floor(Math.random() * 1_000_000)])),
  );
  const shown = BOARD.filter(
    (c) =>
      (!difficulty || c.difficulty === difficulty) && matchesQuery([c.title, c.summary], query),
  );

  return (
    <>
      <SiteHeader current="patients" />
      <main className="page patients">
        <PageIntro eyebrow="Unknown patient" title="Patients waiting to be seen">
          You don’t know what’s wrong yet. Each bay shows what triage recorded: the presenting
          complaint and observations on arrival, scored with NEWS2. Decide who to see first, assess
          them, work out the diagnosis and treat them. The diagnosis stays hidden until your
          debrief.
        </PageIntro>
        <div className="toolbar" role="group" aria-label="Filter patients">
          <label>
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
            >
              <option value="">All</option>
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Search
            <input
              type="search"
              value={query}
              placeholder="e.g. chest pain"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn primary big"
            onClick={() => {
              window.location.hash = surpriseHref();
            }}
          >
            <IconShuffle size={20} /> Surprise me
          </button>
        </div>
        <p className="muted small count" aria-live="polite">
          {shown.length} of {CASES.length} patients
        </p>
        <ol className="board">
          {shown.map((c) => (
            <PatientCard key={c.id} c={c} seed={seeds[c.id] ?? 1} />
          ))}
        </ol>
        {shown.length === 0 && <p className="muted">No patients match those filters.</p>}
        <p className="muted small source-note">
          NEWS2: {NEWS2_SOURCE} Scored here from the simulated observations for teaching; GCS below
          15 counts as new confusion.
        </p>
      </main>
      <Footer />
    </>
  );
}
