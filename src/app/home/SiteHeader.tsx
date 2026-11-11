/** The header for the welcome and case pages: logo, main navigation, settings, theme. */
import type { ReactNode } from 'react';
import { SettingsButton } from '../../ui/settings/SettingsButton.tsx';
import { ThemeToggle } from '../ThemeToggle.tsx';

export type NavKey = 'home' | 'topics' | 'patients' | 'how' | 'teach';

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: 'home', href: '#/', label: 'Home' },
  { key: 'topics', href: '#/topics', label: 'By topic' },
  { key: 'patients', href: '#/patients', label: 'Unknown patient' },
  { key: 'how', href: '#/how', label: 'How it works' },
  { key: 'teach', href: '#/teach', label: 'For teachers' },
];

export function SiteHeader({ current }: { current: NavKey }) {
  return (
    <header className="bar site-bar">
      <div className="brand">
        <h1>
          <a href="#/">Bedside sim</a>
        </h1>
        <p>Virtual patient simulator</p>
      </div>
      <nav className="site-nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.key} href={n.href} aria-current={n.key === current ? 'page' : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="bar-tools">
        <SettingsButton />
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Page heading block used on the inner pages. */
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="page-title">{title}</h2>
      {children && <div className="page-lede">{children}</div>}
    </div>
  );
}
