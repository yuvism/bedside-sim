/**
 * Copies the cases teachers published in a teacher console into the built-in
 * library: `add-case` for every published case at once.
 *
 *   npm run import-published -- https://bedside-sim-teacher.onrender.com
 *
 * Without an address it uses TEACHER_API_URL. It reads the console's open
 * list of published cases (no password needed), adds each case that isn't in
 * the library yet (--replace also updates those that are), and refreshes the
 * generated files. The "Import published cases" GitHub workflow runs it, runs
 * the tests and opens a pull request.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addCase, refreshGenerated, ROOT } from './add-case.ts';

export interface ImportSummary {
  added: string[];
  skipped: string[];
  failed: string[];
}

/** Adds each published case to the library. Returns what happened to each. */
export async function importCases(
  list: readonly unknown[],
  opts: { replace?: boolean; log?: (line: string) => void } = {},
): Promise<ImportSummary> {
  const log = opts.log ?? console.log;
  const out: ImportSummary = { added: [], skipped: [], failed: [] };
  for (const raw of list) {
    const id = String((raw as { id?: unknown } | null)?.id ?? '');
    if (!/^[\w-]+$/.test(id)) {
      out.failed.push(id || '(no id)');
      log(`  ✗ ${id || '(no id)'}: not a valid case id`);
      continue;
    }
    const file = join(ROOT, 'src', 'content', 'cases', `${id}.json`);
    if (existsSync(file)) {
      const same = JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))) === JSON.stringify(raw);
      if (same || !opts.replace) {
        out.skipped.push(id);
        log(
          `  - ${id}: ${same ? 'already in the library' : 'in the library already (--replace updates it)'}`,
        );
        continue;
      }
    }
    try {
      const a = await addCase(raw, { replace: opts.replace });
      out.added.push(a.id);
      log(`  + ${a.id}: "${a.title}" ${a.replaced ? 'updated' : 'added'}`);
    } catch (err) {
      out.failed.push(id);
      log(`  ✗ ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

async function main(argv: string[]): Promise<void> {
  const base = (argv.find((a) => !a.startsWith('--')) ?? process.env['TEACHER_API_URL'] ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) {
    console.error('Usage: npm run import-published -- <teacher console address> [--replace]');
    process.exit(2);
  }
  // A free Render console can take a minute to wake up.
  const res = await fetch(`${base}/api/published`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${base}/api/published answered HTTP ${res.status}`);
  const list = (await res.json()) as unknown;
  if (!Array.isArray(list)) throw new Error('The published list is not a list.');
  console.log(`${list.length} published case(s) at ${base}`);

  const s = await importCases(list, { replace: argv.includes('--replace') });
  if (s.added.length) refreshGenerated();
  console.log(
    `\nAdded ${s.added.length}, skipped ${s.skipped.length}, failed ${s.failed.length}.` +
      (s.added.length ? ' Run the tests, then commit and push.' : ''),
  );
  const ghOut = process.env['GITHUB_OUTPUT'];
  if (ghOut) appendFileSync(ghOut, `added=${s.added.length}\n`);
  if (s.failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
