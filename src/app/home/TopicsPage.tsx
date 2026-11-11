/** "Learn by topic": pick a condition. Cases are grouped by specialty and named by diagnosis. */
import { useMemo, useState } from 'react';
import { CASES } from '../../content/library.ts';
import type { CaseDef } from '../../engine/types.ts';
import {
  conditionOf,
  DIFFICULTY,
  LEVEL,
  matchesQuery,
  summaryOf,
  type Difficulty,
} from '../caseMeta.ts';
import { Footer } from '../Footer.tsx';
import { getProgress } from '../progress.ts';
import { caseHref } from '../router.ts';
import { IconClock } from './icons.tsx';
import { PageIntro, SiteHeader } from './SiteHeader.tsx';
import './home.css';

export function Progress({ caseId, seenWord = 'attempt' }: { caseId: string; seenWord?: string }) {
  const p = getProgress(caseId);
  if (!p) return <span className="progress muted">Not tried yet</span>;
  return (
    <span className="progress done">
      Best {p.best} · {p.attempts} {p.attempts === 1 ? seenWord : `${seenWord}s`}
    </span>
  );
}

export function DifficultyChip({ d }: { d: Difficulty }) {
  return (
    <span className={`chip diff ${d}`}>
      <span className="dots" aria-hidden="true">
        {'●'.repeat(LEVEL[d])}
        {'○'.repeat(3 - LEVEL[d])}
      </span>{' '}
      {DIFFICULTY[d]}
    </span>
  );
}

function TopicCard({ c }: { c: CaseDef }) {
  return (
    <li className="card case-card" data-specialty={c.specialty}>
      <p className="meta">
        <span className="spec-name">
          <span className="spec-dot" aria-hidden="true" />
          {c.specialty}
        </span>
        <DifficultyChip d={c.difficulty} />
      </p>
      <h3>
        <a href={caseHref(c.id)}>{conditionOf(c)}</a>
      </h3>
      <p className="presents">Presents as “{c.title}”</p>
      <p className="summary">{summaryOf(c)}</p>
      {c.tags && c.tags.length > 0 && (
        <p className="tags">
          {c.tags.slice(0, 3).map((t) => (
            <span key={t} className="tag-chip">
              {t}
            </span>
          ))}
        </p>
      )}
      <p className="meta foot">
        <span className="time">
          <IconClock size={16} /> {c.estMinutes} min
        </span>
        <Progress caseId={c.id} />
      </p>
    </li>
  );
}

export function TopicsPage() {
  const [specialty, setSpecialty] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [query, setQuery] = useState('');
  const specialties = useMemo(() => [...new Set(CASES.map((c) => c.specialty))].sort(), []);
  const shown = CASES.filter(
    (c) =>
      (!specialty || c.specialty === specialty) &&
      (!difficulty || c.difficulty === difficulty) &&
      matchesQuery([conditionOf(c), c.title, c.summary, c.specialty, ...(c.tags ?? [])], query),
  );
  const sorted = [...shown].sort(
    (a, b) =>
      a.specialty.localeCompare(b.specialty) || conditionOf(a).localeCompare(conditionOf(b)),
  );

  return (
    <>
      <SiteHeader current="topics" />
      <main className="page topics">
        <PageIntro eyebrow="Learn by topic" title="Choose a condition to practise">
          You know the diagnosis before you start, so you can focus on managing it well. For a
          harder challenge, try an <a href="#/patients">unknown patient</a>.
        </PageIntro>
        <div className="toolbar" role="group" aria-label="Filter conditions">
          <label>
            Specialty
            <select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">All</option>
              {specialties.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
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
              placeholder="e.g. asthma"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <p className="muted small count" aria-live="polite">
          {shown.length} of {CASES.length} conditions
        </p>
        <ul className="case-grid">
          {sorted.map((c) => (
            <TopicCard key={c.id} c={c} />
          ))}
        </ul>
        {shown.length === 0 && <p className="muted">No conditions match those filters.</p>}
      </main>
      <Footer />
    </>
  );
}
