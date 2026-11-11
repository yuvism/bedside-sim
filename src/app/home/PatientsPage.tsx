/**
 * "Unknown patient": a board of patients waiting to be seen. Only what a
 * triage nurse would know is shown (name, age, presenting complaint); the
 * specialty, diagnosis and topic tags stay hidden until the debrief.
 */
import { useState } from 'react';
import { CASES } from '../../content/library.ts';
import { materialiseCase } from '../../engine/variation.ts';
import {
  DIFFICULTY,
  matchesQuery,
  patientCode,
  summaryOf,
  surpriseHref,
  type Difficulty,
} from '../caseMeta.ts';
import { Footer } from '../Footer.tsx';
import { getProgress } from '../progress.ts';
import { patientHref } from '../router.ts';
import { IconClock, IconShuffle } from './icons.tsx';
import { PageIntro, SiteHeader } from './SiteHeader.tsx';
import { DifficultyChip } from './TopicsPage.tsx';
import './home.css';

/** Board order is by code, so it doesn't mirror the topic list. */
const BOARD = [...CASES].sort((a, b) => patientCode(a.id).localeCompare(patientCode(b.id)));

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

function Seen({ caseId }: { caseId: string }) {
  const p = getProgress(caseId);
  return p ? (
    <span className="progress done">Seen · best {p.best}</span>
  ) : (
    <span className="progress muted">Not seen yet</span>
  );
}

export function PatientsPage() {
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [query, setQuery] = useState('');
  // One seed per patient for this visit, so the age shown is the patient you meet.
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
          You don’t know what’s wrong yet. Pick a patient, assess them, work out the diagnosis and
          treat them. The specialty and diagnosis stay hidden until your debrief.
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
          {shown.map((c) => {
            const seed = seeds[c.id] ?? 1;
            const p = materialiseCase(c, seed).caseDef.patient;
            const bay = BOARD.indexOf(c) + 1;
            return (
              <li key={c.id} className="card patient-card">
                <div className="pc-top">
                  <span className="bay">Bay {bay}</span>
                  <span className="time">
                    <IconClock size={16} /> {c.estMinutes} min
                  </span>
                </div>
                <div className="pc-who">
                  <span className="avatar-dot" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <span className="muted">, {p.age}</span>
                  </span>
                </div>
                <h3>
                  <a href={patientHref(patientCode(c.id), seed)}>{c.title}</a>
                </h3>
                <p className="summary">{summaryOf(c, p.age)}</p>
                <p className="meta foot">
                  <DifficultyChip d={c.difficulty} />
                  <Seen caseId={c.id} />
                </p>
              </li>
            );
          })}
        </ol>
        {shown.length === 0 && <p className="muted">No patients match those filters.</p>}
      </main>
      <Footer />
    </>
  );
}
