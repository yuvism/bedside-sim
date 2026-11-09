export const DISCLAIMER = 'Educational simulation. Simplified physiology. Not clinical guidance.';

export function Footer() {
  return (
    <footer className="site-footer">
      <p>{DISCLAIMER}</p>
      <p>
        <a href="https://github.com/yuvism/bedside-sim">Source on GitHub</a> · MIT licence
      </p>
    </footer>
  );
}
