import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentCopies, parityFixture } from '../../../scripts/unity-sync.ts';
import { caseById, LIBRARY } from '../helpers.ts';

describe('Unity port pack', () => {
  it('has current copies of the content JSON (run npm run unity:sync)', () => {
    const copies = contentCopies();
    expect(copies.length).toBeGreaterThanOrEqual(14);
    for (const f of copies) expect(readFileSync(f.path, 'utf8'), f.path).toBe(f.text);
  });

  it('has a current parity fixture from the TypeScript engine (run npm run unity:sync)', () => {
    const f = parityFixture(LIBRARY, caseById('anaphylaxis-01'));
    expect(readFileSync(f.path, 'utf8')).toBe(f.text);
    const fixture = JSON.parse(f.text) as { scenarios: { name: string; outcome: string }[] };
    expect(fixture.scenarios.map((s) => [s.name, s.outcome])).toEqual([
      ['ideal', 'stabilised'],
      ['untreated', 'died'],
    ]);
  });
});
