export const DISCLAIMER = 'Educational simulation. Simplified physiology. Not clinical guidance.';

export function Footer({ seed }: { seed?: number }) {
  return (
    <footer className="site-footer">
      <p>{DISCLAIMER}</p>
      <p>
        {seed !== undefined && <span>Seed {seed} · </span>}
        <a href="https://github.com/yuvism/bedside-sim">Source on GitHub</a> · MIT licence
      </p>
    </footer>
  );
}
