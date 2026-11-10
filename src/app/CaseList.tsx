import { useMemo, useState } from 'react';
import { CASES } from '../content/library.ts';
import type { CaseDef } from '../engine/types.ts';
import { SettingsButton } from '../ui/settings/SettingsButton.tsx';
import { Footer } from './Footer.tsx';
import { getProgress } from './progress.ts';
import { caseHref } from './router.ts';
import { ThemeToggle } from './ThemeToggle.tsx';
import './landing.css';

const DIFFICULTY = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' } as const;
type Difficulty = keyof typeof DIFFICULTY;
const LEVEL: Record<Difficulty, number> = { foundation: 1, core: 2, advanced: 3 };
const FIRST_CASE = 'anaphylaxis-01';

const STEPS = [
  {
    n: '1',
    title: 'Read the brief',
    text: 'Who the patient is and why you’re here. Choose guided (with prompts) or exam mode.',
  },
  {
    n: '2',
    title: 'Assess as you would',
    text: 'Work through ABCDE, ask questions in your own words, and watch the live monitor.',
  },
  {
    n: '3',
    title: 'Treat and lead the team',
    text: 'Order drugs, fluids, oxygen and tests. The nurse reads back, carries them out and questions unsafe orders.',
  },
  {
    n: '4',
    title: 'Learn from the debrief',
    text: 'Your score, what you missed, the vitals timeline and teaching points. Replay from any minute.',
  },
];

const TOOLS = [
  {
    href: '#/editor',
    title: 'Case editor',
    text: 'Build or change a case with forms, then test-run it at the bedside.',
  },
  {
    href: '#/validate',
    title: 'Video validation',
    text: 'Compare the simulation with a timeline annotated from a real treatment video.',
  },
  {
    href: '#/learn',
    title: 'Learn from a video',
    text: 'Let a case update itself from a video and propose what’s missing, for review.',
  },
];

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

const ECG =
  '0,55 30,55 38,50 44,55 60,55 66,62 72,10 78,72 84,55 110,55 120,46 132,55 160,55 168,50 174,55 190,55 196,62 202,10 208,72 214,55 240,55 250,46 262,55 290,55 298,50 304,55 320,55';

/** A decorative ECG trace for the hero. */
function HeroMonitor() {
  return (
    <div className="hero-monitor" aria-hidden="true">
      <svg viewBox="0 0 320 90" preserveAspectRatio="none">
        <polyline className="hero-ecg" points={ECG} />
        <polyline className="hero-ecg sweep" points={ECG} />
      </svg>
      <div className="hero-nums">
        <span className="hn hr">
          HR <b>118</b>
        </span>
        <span className="hn spo2">
          SpO₂ <b>94</b>
        </span>
        <span className="hn bp">
          NIBP <b>87/51</b>
        </span>
      </div>
    </div>
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
  const first = CASES.find((c) => c.id === FIRST_CASE);

  return (
    <>
      <header className="bar">
        <div className="brand">
          <h1>Bedside sim</h1>
          <p>Virtual patient simulator</p>
        </div>
        <SettingsButton />
        <ThemeToggle />
      </header>
      <main className="page landing">
        <section className="hero" aria-labelledby="hero-h">
          <div className="hero-copy">
            <p className="eyebrow">Free and open-source virtual patients</p>
            <h2 id="hero-h">Practise acute care on a patient who responds to every decision</h2>
            <p className="hero-sub">
              Assess, talk to and treat the patient while the monitor changes second by second.
              Delays and wrong turns have consequences. Then see your score, what you missed and
              why.
            </p>
            <div className="hero-cta">
              {first && (
                <a className="btn primary big" href={caseHref(first.id)}>
                  Start with “{first.title}”
                </a>
              )}
              <a className="btn big" href="#how">
                How a case works
              </a>
            </div>
          </div>
          <HeroMonitor />
        </section>

        <section id="how" className="steps" aria-label="How a case works">
          {STEPS.map((s) => (
            <div key={s.n} className="step card">
              <span className="step-n" aria-hidden="true">
                {s.n}
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </section>

        <div className="list-head" id="cases">
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
            <li key={c.id} className="card case-card" data-specialty={c.specialty}>
              <p className="meta">
                <span className="spec">{c.specialty}</span>
                <span className={`chip diff ${c.difficulty}`}>
                  <span className="dots" aria-hidden="true">
                    {'●'.repeat(LEVEL[c.difficulty])}
                    {'○'.repeat(3 - LEVEL[c.difficulty])}
                  </span>{' '}
                  {DIFFICULTY[c.difficulty]}
                </span>
              </p>
              <h3>
                <a href={caseHref(c.id)}>{c.title}</a>
              </h3>
              <p>{c.summary.replaceAll('{age}', String(c.patient.age))}</p>
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
                <span>⏱ About {c.estMinutes} min</span>
                <Best caseId={c.id} />
              </p>
            </li>
          ))}
        </ul>
        {shown.length === 0 && <p className="muted">No cases match those filters.</p>}

        <section className="tools" aria-labelledby="tools-h">
          <h2 id="tools-h" className="page-title">
            For teachers and researchers
          </h2>
          <div className="tool-grid">
            {TOOLS.map((t) => (
              <a key={t.href} className="card tool" href={t.href}>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
                <span className="tool-go" aria-hidden="true">
                  Open →
                </span>
              </a>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
