/**
 * Teacher console server. Start with `npm run teacher` (builds the web app
 * first) or `npm run server` (API and the last build).
 *
 * Settings come from .env in the project folder (see .env.example):
 *   GEMINI_API_KEY  your free key from https://aistudio.google.com/apikey
 *   GEMINI_MODEL    optional, defaults to gemini-3.6-flash
 *   GEMINI_FALLBACK_MODEL  optional, models tried next (comma-separated)
 *   GEMINI_MOCK=1   answer autofill from the bundled AMAX4 annotation (tests, demos)
 *   PORT, HOST      default 8787 on 127.0.0.1 (this computer only)
 *   DATA_DIR        where uploads and published cases live (default server/data)
 *   TEACHER_PASSWORD  sign-in password; required when HOST isn't this computer
 *   TEACHER_HOSTS   extra host names to accept (comma-separated)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { loadBundledCases, ROOT } from './content.ts';
import { geminiConfig, geminiStatus } from './gemini.ts';
import { openStore, sweepUploads } from './store.ts';

const envFile = join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const port = Number(env['PORT'] ?? 8787);
const host = env['HOST'] ?? '127.0.0.1';
const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
if (!local && !(env['TEACHER_PASSWORD'] ?? '').trim()) {
  console.error(
    `HOST is ${host}, so anyone on the network could reach the console. Set TEACHER_PASSWORD first.`,
  );
  process.exit(1);
}
const store = openStore(env['DATA_DIR'] ?? join(ROOT, 'server', 'data'));
sweepUploads(store);

const app = createApp({
  store,
  env,
  distDir: join(ROOT, 'dist-teacher'),
  bundled: loadBundledCases(),
  mockCsv: readFileSync(
    join(ROOT, 'src', 'content', 'validation', 'amax4-simulation-annotation.csv'),
    'utf8',
  ),
});

const status = geminiStatus(geminiConfig(env));
app.listen(port, host, () => {
  console.log(`Teacher console: ${env['RENDER_EXTERNAL_URL'] ?? `http://localhost:${port}`}`);
  console.log(
    status === 'ready'
      ? `Autofill with AI: ready (${geminiConfig(env).model})`
      : status === 'mock'
        ? 'Autofill with AI: mock mode (GEMINI_MOCK=1)'
        : 'Autofill with AI: add GEMINI_API_KEY to .env to switch it on',
  );
});
