/**
 * `npm run demo`: both prototypes on this computer, connected, for a live demo.
 *
 *   Teacher console  http://localhost:8787  (npm run teacher, your .env key)
 *   Student app      http://localhost:5175/bedside-sim/  (shows published cases)
 *
 * Press Ctrl+C to stop both.
 */
import { spawn } from 'node:child_process';

const TEACHER = 'http://localhost:8787';
const STUDENT = 'http://localhost:5175/bedside-sim/';

const run = (label, args, env) => {
  const child = spawn('npm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  child.on('exit', (code) => {
    if (code) console.error(`${label} stopped (exit ${code}).`);
  });
  return child;
};

const children = [
  run('Teacher console', ['run', 'teacher'], { VITE_STUDENT_URL: STUDENT }),
  run('Student app', ['run', 'dev', '--', '--port', '5175', '--strictPort'], {
    VITE_API_URL: TEACHER,
    VITE_TEACHER_URL: TEACHER,
  }),
];

console.log(`\nLive demo:\n  Teacher console  ${TEACHER}\n  Student app      ${STUDENT}\n`);

const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
