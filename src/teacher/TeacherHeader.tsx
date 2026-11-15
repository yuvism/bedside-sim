/** Header for every teacher console page: brand, console navigation, link to the student app. */
import { ThemeToggle } from '../app/ThemeToggle.tsx';
import { STUDENT_URL } from './urls.ts';
import '../app/home/home.css';

export type TeacherNav = 'home' | 'learn' | 'editor' | 'validate' | 'published';

const NAV: { key: TeacherNav; href: string; label: string }[] = [
  { key: 'home', href: '#/', label: 'Dashboard' },
  { key: 'learn', href: '#/learn', label: 'Learn from a video' },
  { key: 'editor', href: '#/editor', label: 'Case editor' },
  { key: 'validate', href: '#/validate', label: 'Validation' },
  { key: 'published', href: '#/published', label: 'Published' },
];

export function TeacherHeader({ current, title }: { current?: TeacherNav; title?: string }) {
  return (
    <header className="bar site-bar teacher-bar">
      <div className="brand">
        <h1>
          <a href="#/">Bedside sim</a>
        </h1>
        <p>{title ?? 'Teacher console'}</p>
      </div>
      <nav className="site-nav" aria-label="Teacher console">
        {NAV.map((n) => (
          <a key={n.key} href={n.href} aria-current={n.key === current ? 'page' : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="bar-tools">
        <a className="btn small" href={STUDENT_URL} target="_blank" rel="noreferrer">
          Student app ↗
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
