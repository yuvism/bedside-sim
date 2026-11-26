/**
 * Adds a case exported from the teacher console (case editor → Export JSON)
 * to the built-in library, so every copy of the student app has it for good.
 *
 *   npm run add-case -- path/to/case.json            check, save, test
 *   npm run add-case -- path/to/case.json --push     ...then commit and push
 *
 * Options: --replace (update a case that is already there), --no-test.
 *
 * It checks the case against the schema and the shared library, saves it as
 * src/content/cases/<id>.json, refreshes docs/clinical-review.md and the Unity
 * copies, and runs the unit tests. A case made from another one (an "-video"
 * draft) is tested with its original's ideal run. After a push, GitHub
 * Actions rebuilds the student app, so the case is live in about 2 minutes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as prettier from 'prettier';
import { checkCase } from '../src/content/library.ts';
import { baseCaseId, IDEAL, policyFor } from '../tests/unit/cases/policies.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Files a new case changes, for `git add`. */
export const CHANGED_PATHS = ['src/content/cases', 'docs/clinical-review.md', 'unity'];

export interface Added {
  id: string;
  title: string;
  /** Repo-relative path of the saved file. */
  file: string;
  replaced: boolean;
  /** The case whose ideal run tests it, or null when none fits. */
  testedAs: string | null;
}

/** Checks a case and saves it into the library. Throws, listing the problems, if it isn't valid. */
export async function addCase(raw: unknown, opts: { replace?: boolean } = {}): Promise<Added> {
  const r = checkCase(raw);
  if (!r.ok) throw new Error(`The case has problems:\n  - ${r.issues.join('\n  - ')}`);
  const { id, title } = r.value;
  const file = `src/content/cases/${id}.json`;
  const abs = join(ROOT, file);
  const replaced = existsSync(abs);
  if (replaced && !opts.replace)
    throw new Error(`${file} is already in the library. Add --replace to update it.`);
  const options = { ...(await prettier.resolveConfig(abs)), filepath: abs };
  writeFileSync(abs, await prettier.format(JSON.stringify(raw), options));
  const testedAs = !policyFor(id) ? null : IDEAL[id] ? id : baseCaseId(id);
  return { id, title, file, replaced, testedAs };
}

/** Runs an npm script or other command in the repo, showing its output. */
export function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
}

/** Regenerates what depends on the case files (the review list and the Unity copies). */
export function refreshGenerated(): void {
  run('npm', ['run', '--silent', 'review:build']);
  run('npm', ['run', '--silent', 'unity:sync']);
}

async function main(argv: string[]): Promise<void> {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const path = argv.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error(
      'Usage: npm run add-case -- <exported-case.json> [--replace] [--no-test] [--push]',
    );
    process.exit(2);
  }
  const step = (n: number, text: string) => console.log(`\n${n}. ${text}`);

  step(1, `Checking ${path}`);
  const added = await addCase(JSON.parse(readFileSync(path, 'utf8')) as unknown, {
    replace: flags.has('--replace'),
  });
  console.log(`   ✓ "${added.title}" (${added.id}) is a valid case`);
  console.log(`   ✓ ${added.replaced ? 'Updated' : 'Saved'} ${added.file}`);

  step(2, 'Refreshing the clinical review list and the Unity copies');
  refreshGenerated();
  console.log('   ✓ docs/clinical-review.md and unity/ are up to date');

  if (flags.has('--no-test')) {
    step(3, 'Tests skipped (--no-test)');
  } else {
    step(3, `Running the tests (the new case is tested like ${added.testedAs ?? 'a new case'})`);
    if (!added.testedAs)
      console.log(
        `   ! No ideal-run policy fits "${added.id}": add one in tests/unit/cases/policies.ts.`,
      );
    try {
      run('npx', ['vitest', 'run', '--reporter=dot']);
    } catch {
      throw new Error(
        `A test failed, so nothing was pushed. The case is saved in ${added.file}: fix it in the case editor and run this again with --replace, or delete the file.`,
      );
    }
    console.log('   ✓ All tests pass');
  }

  if (flags.has('--push')) {
    step(4, 'Committing and pushing');
    run('git', ['add', ...CHANGED_PATHS]);
    run('git', ['commit', '-m', `feat(cases): add ${added.id} from the teacher console`]);
    run('git', ['push']);
    console.log('   ✓ Pushed. GitHub rebuilds the student app in about 2 minutes.');
  } else {
    step(4, 'Next: commit and push, and GitHub rebuilds the student app (about 2 minutes)');
    console.log(`   git add ${CHANGED_PATHS.join(' ')}`);
    console.log(`   git commit -m "feat(cases): add ${added.id} from the teacher console"`);
    console.log('   git push');
    console.log('   (or run this again with --push)');
  }
  console.log(`\nDone: ${relative(process.cwd(), join(ROOT, added.file)) || added.file}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
