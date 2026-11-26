/** add-case and import-published: checks that run without writing any file. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addCase, commandLine } from '../../../scripts/add-case.ts';
import { importCases } from '../../../scripts/import-published.ts';
import { baseCaseId, policyFor } from '../cases/policies.ts';

const anaphylaxis = JSON.parse(
  readFileSync(new URL('../../../src/content/cases/anaphylaxis-01.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('a case added from the teacher console', () => {
  it('is tested like the case it was made from', () => {
    expect(baseCaseId('asthma-02-video')).toBe('asthma-02');
    expect(baseCaseId('asthma-02-video-copy')).toBe('asthma-02');
    expect(baseCaseId('sepsis-01')).toBe('sepsis-01');
    expect(policyFor('asthma-02-video')).toBeDefined();
    expect(policyFor('brand-new-case')).toBeUndefined();
  });

  it('is refused, with its problems listed, when it is not a valid case', async () => {
    await expect(addCase({ id: 'broken' })).rejects.toThrow(/The case has problems/);
  });

  it('never overwrites a library case unless asked to', async () => {
    await expect(addCase(anaphylaxis)).rejects.toThrow(/already in the library.*--replace/);
  });

  it('quotes the arguments it passes to a shell', () => {
    expect(commandLine('npm', ['run', '--silent', 'review:build'])).toBe(
      'npm run --silent review:build',
    );
    expect(commandLine('git', ['commit', '-m', 'feat(cases): add x'])).toBe(
      'git commit -m "feat(cases): add x"',
    );
  });

  it('import skips cases already in the library and rejects odd ids', async () => {
    const lines: string[] = [];
    const s = await importCases([anaphylaxis, { id: '../escape' }, null], {
      log: (l) => lines.push(l),
    });
    expect(s).toEqual({ added: [], skipped: ['anaphylaxis-01'], failed: ['../escape', '(no id)'] });
    expect(lines[0]).toMatch(/already in the library/);
  });
});
