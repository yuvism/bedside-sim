import { useMemo, useState } from 'react';
import { CASES } from '../content/library.ts';
import type { CaseDef } from '../engine/types.ts';
import { Footer } from './Footer.tsx';
import { getProgress } from './progress.ts';
import { caseHref } from './router.ts';
import { SettingsButton } from '../ui/settings/SettingsButton.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

const DIFFICULTY = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' } as const;
type Difficulty = keyof typeof DIFFICULTY;

function Best({ caseId }: { caseId: string }) {
  const p = getProgress(caseId);
  if (!p) return <span className="best muted">Not attempted</span>;
  return (
    <span className="best">
      Best {p.best} · {p.attempts} {p.attempts === 1 ? 'attempt' : 'attempts'}
    </span>
  );
}

function matches(c: CaseDef, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return [c.title, c.summary, c.specialty, ...(c.tags ?? [])].some((x) =>
    x.toLowerCase().includes(s),
  );
}

export function CaseList() {
  const [specialty, setSpecialty] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [query, setQuery] = useState('');
  const specialties = useMemo(() => [...new Set(CASES.map((c) => c.specialty))].sort(), []);
  const shown = CASES.filter(
    (c) =>
      (!specialty || c.specialty === specialty) &&
      (!difficulty || c.difficulty === difficulty) &&
      matches(c, query),
  );

  return (
    <>
      <header className="bar">
        <div className="brand">
          <h1>Bedside sim</h1>
          <p>Virtual patient simulator</p>
        </div>
        <a className="btn" href="#/editor">
          Case editor
        </a>
        <a className="btn" href="#/validate">
          Validation
        </a>
        <SettingsButton />
        <ThemeToggle />
      </header>
      <main className="page">
        <div className="list-head">
          <h2 className="page-title">Cases</h2>
          <div className="filters" role="group" aria-label="Filter cases">
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
            <label>
              Search
              <input
                type="search"
                value={query}
                placeholder="e.g. sepsis"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </div>
        <p className="muted small" aria-live="polite">
          {shown.length} of {CASES.length} cases
        </p>
        <ul className="case-grid">
          {shown.map((c) => (
            <li key={c.id} className="card case-card">
              <p className="meta">
                {c.specialty} ·{' '}
                <span className={`diff ${c.difficulty}`}>{DIFFICULTY[c.difficulty]}</span>
              </p>
              <h3>
                <a href={caseHref(c.id)}>{c.title}</a>
              </h3>
              <p>{c.summary.replaceAll('{age}', String(c.patient.age))}</p>
              <p className="meta foot">
                <span>About {c.estMinutes} min</span>
                <Best caseId={c.id} />
              </p>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="muted">No cases match those filters.</p>}
      </main>
      <Footer />
    </>
  );
}
