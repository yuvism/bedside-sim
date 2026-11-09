import { CASES } from '../content/library.ts';
import { Footer } from './Footer.tsx';
import { getProgress } from './progress.ts';
import { caseHref } from './router.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

const DIFFICULTY = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' } as const;

function Best({ caseId }: { caseId: string }) {
  const p = getProgress(caseId);
  if (!p) return <p className="meta">Not attempted yet</p>;
  return (
    <p className="meta">
      Best score {p.best} · {p.attempts} {p.attempts === 1 ? 'attempt' : 'attempts'}
    </p>
  );
}

export function CaseList() {
  return (
    <>
      <header className="bar">
        <div className="brand">
          <h1>Bedside sim</h1>
          <p>Virtual patient simulator</p>
        </div>
        <ThemeToggle />
      </header>
      <main className="page">
        <h2 className="page-title">Cases</h2>
        <ul className="case-grid">
          {CASES.map((c) => (
            <li key={c.id} className="card case-card">
              <h3>
                <a href={caseHref(c.id)}>{c.title}</a>
              </h3>
              <p>{c.summary}</p>
              <p className="meta">
                {c.specialty} · {DIFFICULTY[c.difficulty]} · about {c.estMinutes} min
              </p>
              <Best caseId={c.id} />
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
